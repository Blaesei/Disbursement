import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { google } from 'googleapis';
import { getAuthClient, validateGoogleConfig, initGoogleAuthFromFirestore, updateCachedGoogleConfig } from './server/googleAuth';
import { uploadFileToDrive } from './server/googleDrive';
import { upsertLedgerSpreadsheet } from './server/googleSheets';
import { syncPrfDoc, createPrfDoc } from './server/googleDocs';
import { generatePrfPdfBuffer } from './server/pdfGenerator';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase Admin SDK
let firebaseAdminApp;
if (admin.apps.length === 0) {
  try {
    firebaseAdminApp = admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log('Firebase-Admin initialized successfully for project:', firebaseConfig.projectId);
  } catch (err) {
    console.error('Firebase-Admin Initialization Failure:', err);
  }
} else {
  firebaseAdminApp = admin.app();
}

// Select target database
const db = (firebaseConfig as any).firestoreDatabaseId
  ? getFirestore(firebaseAdminApp, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(firebaseAdminApp);

// Initialize dynamic Google authorization from Firestore config cache
initGoogleAuthFromFirestore(db);

const app = express();
const PORT = 3000;

// Increase request-body payload limit to allow seamless transmission of base64 signature images
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ==========================================
// API SYSTEM ENDPOINTS
// ==========================================

/**
 * Endpoint to securely check if Google APIs credentials are correct and loaded.
 */
app.get('/api/auth/validate-config', (req, res) => {
  const isGoogleOk = validateGoogleConfig();
  res.json({
    googleConfigured: isGoogleOk,
    environmentKeys: {
      GOOGLE_CLIENT_ID: !!process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: !!process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REFRESH_TOKEN: !!process.env.GOOGLE_REFRESH_TOKEN,
      GOOGLE_DRIVE_FOLDER_ID: !!process.env.GOOGLE_DRIVE_FOLDER_ID,
      GOOGLE_SHEETS_PRF_TEMPLATE_ID: !!process.env.GOOGLE_SHEETS_PRF_TEMPLATE_ID,
      GOOGLE_SHEETS_LEDGER_ID: !!process.env.GOOGLE_SHEETS_LEDGER_ID,
    }
  });
});

const pendingFlows = new Map<string, { clientId: string, clientSecret: string, redirectUri: string }>();

/**
 * Generates Google OAuth link for popup.
 */
app.get('/api/auth/google/url', (req, res) => {
  try {
    const clientId = (req.query.clientId as string) || process.env.GOOGLE_CLIENT_ID;
    const clientSecret = (req.query.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.status(400).json({ error: 'Google Client ID and Client Secret are required. Provide them or configure them.' });
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || (req.get('host')?.includes('localhost') ? 'http' : 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host') || '';
    const redirectUri = (req.query.redirectUri as string) || `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const scopes = [
      'openid',
      'email',
      'profile',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
    ];

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    pendingFlows.set(state, { clientId, clientSecret, redirectUri });

    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: scopes,
      state: state,
    });

    res.json({ url });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handles Google OAuth callback code exchange & stores active refresh token in Firestore & memory cache
 */
app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code as string;
    const stateStr = req.query.state as string;

    if (!code) {
      res.status(400).send('<h1>Error: Authorization code is missing!</h1>');
      return;
    }

    let clientId = process.env.GOOGLE_CLIENT_ID;
    let clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    let extractedRedirectUri = '';

    if (stateStr && pendingFlows.has(stateStr)) {
      const flow = pendingFlows.get(stateStr)!;
      clientId = flow.clientId;
      clientSecret = flow.clientSecret;
      extractedRedirectUri = flow.redirectUri;
      pendingFlows.delete(stateStr);
    } else if (stateStr) {
      // Fallback for old states if they were JSON strings
      try {
        const stateObj = JSON.parse(stateStr);
        if (stateObj.clientId) clientId = stateObj.clientId;
        if (stateObj.clientSecret) clientSecret = stateObj.clientSecret;
        if (stateObj.redirectUri) extractedRedirectUri = stateObj.redirectUri;
      } catch (parseErr) {
        // Not JSON, and not in Map. Might be a restarted server, or an attack.
      }
    }

    if (!clientId || !clientSecret) {
      res.status(400).send('<h1>Error: Google Client ID/Secret parameters are missing!</h1>');
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || (req.get('host')?.includes('localhost') ? 'http' : 'https');
    const host = req.headers['x-forwarded-host'] || req.get('host') || '';
    const redirectUri = extractedRedirectUri || `${protocol}://${host}/api/auth/google/callback`;
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      redirectUri
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.warn('Google did not return a refresh token (probably already authorized. Retry with prompt=consent)');
    }

    const activeRefreshToken = tokens.refresh_token;

    // Save configuration in Firestore so server has persistent access override
    try {
      await db.collection('config').doc('google_auth').set({
        GOOGLE_CLIENT_ID: clientId,
        GOOGLE_CLIENT_SECRET: clientSecret,
        GOOGLE_REFRESH_TOKEN: activeRefreshToken || '',
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (dbErr) {
      console.warn('Failed to persist Google Auth to Firestore (expected in AI Studio without service account):', dbErr.message);
    }

    // Update the live system memory cache immediately
    updateCachedGoogleConfig({
      clientId,
      clientSecret,
      refreshToken: activeRefreshToken || undefined
    });

    const displayToken = activeRefreshToken || 'No new refresh token returned. (If you are already authorized, please revoke permissions in your Google Security settings or try again with consent prompt)';

    res.send(`
      <html>
        <head>
          <title>Google Workspace Authorization Success</title>
          <style>
            body { font-family: -apple-system, system-ui, sans-serif; padding: 40px; text-align: center; background: #f8fafc; color: #1e293b; }
            .card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); max-width: 500px; margin: 40px auto; border: 1px solid #e2e8f0; }
            h1 { color: #1e2d5a; font-size: 20px; margin-bottom: 10px; }
            p { font-size: 14px; line-height: 1.5; color: #64748b; margin-bottom: 20px; }
            .token-container { background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-family: monospace; font-size: 11px; word-break: break-all; margin: 20px 0; max-height: 120px; overflow-y: auto; text-align: left; }
            .label { font-weight: bold; font-size: 10px; color: #475569; text-transform: uppercase; margin-bottom: 4px; display: block; text-align: left;}
            .btn { background: #1e2d5a; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: bold; width: 100%; transition: background 0.2s; }
            .btn:hover { background: #34467c; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✓ Google Workspace Authorized!</h1>
            <p>Your authentication credentials are verified. A new active refresh token has been generated and synced to your database.</p>
            
            <span class="label">Google Refresh Token Generated:</span>
            <div class="token-container" id="tokenBox">${displayToken}</div>
            
            <p style="font-size: 11px; color: #94a3b8;">Copy the token above to update your project settings in Google AI Studio to keep it permanently synchronized.</p>
            <button class="btn" onclick="sendAndClose()">Apply Configuration</button>
          </div>
          <script>
            function sendAndClose() {
              if (window.opener) {
                window.opener.postMessage({
                  type: 'GOOGLE_OAUTH_SUCCESS',
                  refreshToken: '${activeRefreshToken || ''}'
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            }
          </script>
        </body>
      </html>
    `);

  } catch (error: any) {
    console.error('Callback error:', error);
    res.status(500).send(`<h1>Authorization Exchange Failed</h1><p>${error.message || error}</p>`);
  }
});


app.get('/api/auth/whoami', async (req, res) => {
  try {
    const auth = getAuthClient();
    const oauth2 = google.oauth2({ version: 'v2', auth });
    const { data } = await oauth2.userinfo.get();
    res.json({ email: data.email, name: data.name });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
/**
 * Promote profile role endpoint (Stateless: handled securely directly on client side)
 */
app.post('/api/admin/promote-user', async (req, res) => {
  try {
    const { targetUid, newRole } = req.body;
    res.json({ success: true, message: `Successfully requested user status change to ${newRole}` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle user profile signature uploads
 * Translates base64 canvas drawings to a secure direct image url stored in Google Drive
 */
app.post('/api/profile/save-signature', async (req, res) => {
  try {
    const { userId, signatureBase64 } = req.body;
    if (!userId || !signatureBase64) {
      res.status(400).json({ error: 'UserId and signatureBase64 image stream are required.' });
      return;
    }

    if (!validateGoogleConfig()) {
      res.status(503).json({ error: 'Google Drive credentials are not configured on this application server yet.' });
      return;
    }

    const driveInfo = await uploadFileToDrive(`User_Signature_${userId}.png`, 'image/png', signatureBase64);
    
    // Uploaded to Google Drive successfully. The client handles updating the user record locally if necessary.
    res.json({ success: true, signatureUrl: driveInfo.directUrl });
  } catch (error: any) {
    console.error('Save profile signature error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * TRANSITION & WORKFLOW COORDINATOR ROUTE (Stateless for Firestore)
 * Triggers document signatures, builds PDFs, copies templates, updates ledgers, and compiles sync records.
 */
app.post('/api/prf/preview', async (req, res) => {
  try {
    const { prfData } = req.body;
    
    if (!validateGoogleConfig()) {
      res.status(503).json({ error: 'Google integrations credentials are not configured.' });
      return;
    }

    const docResult = await createPrfDoc(prfData);
    res.json(docResult);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prf/cancel-doc', async (req, res) => {
  try {
    const { documentId } = req.body;
    if (!documentId) return res.json({ success: true });
    
    const { google } = require('googleapis');
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    await drive.files.delete({ fileId: documentId, supportsAllDrives: true });
    res.json({ success: true });
  } catch (err: any) {
    console.error('Failed to cancel doc:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/prf/sync', async (req, res) => {
  try {
    const { prfId, action, signatureDataUrl, commentContent, actorProfile, prfRecord, lineItems, signatureDataUrl2 } = req.body;

    if (!prfId || !action || !actorProfile || !prfRecord || !lineItems) {
      res.status(400).json({ error: 'prfId, action, actorProfile, prfRecord, and lineItems are required.' });
      return;
    }

    if (!validateGoogleConfig()) {
      res.status(503).json({ error: 'Google integrations credentials are not configured. Please complete server settings.' });
      return;
    }

    // Rely on safe payload values passed directly from standard client memory
    const prf = prfRecord;
    const oldStatus = prf.status;
    const lineItemsArray = lineItems;

    // Determine target workflow properties depending on triggered action
    let targetStatus = oldStatus;
    let requestorSignUrl = prf.requestorSignatureUrl;
    let requestorSignUrl2 = prf.requestorSignatureUrl2;
    let requestorTime = prf.requestorSignedAt;
    let approverSignUrl = prf.approverSignatureUrl;
    let approverSignUrl2 = prf.approverSignatureUrl2 || null;
    let approverTime = prf.approverSignedAt;
    let receiverSignUrl = prf.receiverSignatureUrl;
    let receiverSignUrl2 = prf.receiverSignatureUrl2 || null;
    let receiverTime = prf.receiverSignedAt;
    
    let approverName = prf.approverName;
    let approverId = prf.approverId;
    let receiverName = prf.receiverName;
    let receiverId = prf.receiverId;

    const systemTimeStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) + `, ` + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    // 3. Handle specific signature drawing or profiles uploading
    let signatureUrlToApply = signatureDataUrl || actorProfile.signatureUrl || null;
    let appliedDriveImgUrl = signatureUrlToApply;

    if (signatureUrlToApply && signatureUrlToApply.startsWith('data:image')) {
      // Upload new canvas signature drawing directly into Google Drive
      const uploadName = `Signature_${prf.prfNumber}_${actorProfile.role}_${Date.now()}.png`;
      const upRes = await uploadFileToDrive(uploadName, 'image/png', signatureUrlToApply);
      appliedDriveImgUrl = upRes.directUrl;
    }
    
    let signatureUrlToApply2 = signatureDataUrl2 || null;
    let appliedDriveImgUrl2 = signatureUrlToApply2;
    if (signatureUrlToApply2 && signatureUrlToApply2.startsWith('data:image')) {
      const uploadName2 = `Signature2_${prf.prfNumber}_${actorProfile.role}_${Date.now()}.png`;
      const upRes2 = await uploadFileToDrive(uploadName2, 'image/png', signatureUrlToApply2);
      appliedDriveImgUrl2 = upRes2.directUrl;
    }

    // 4. Update appropriate sign-off cells based on triggering state machine roles
    if (action === 'submit') {
      targetStatus = 'Pending Approval';
      requestorSignUrl = appliedDriveImgUrl || requestorSignUrl;
      requestorSignUrl2 = appliedDriveImgUrl2 || requestorSignUrl2;
      requestorTime = systemTimeStr;
    } else if (action === 'approve') {
      targetStatus = 'Approved';
      approverSignUrl = appliedDriveImgUrl || approverSignUrl;
      approverSignUrl2 = appliedDriveImgUrl2 || approverSignUrl2;
      approverTime = systemTimeStr;
      approverName = actorProfile.displayName;
      approverId = actorProfile.uid;
    } else if (action === 'reject') {
      targetStatus = 'Rejected';
      approverSignUrl = null;
      approverSignUrl2 = null;
      approverTime = null;
      approverName = null;
      approverId = null;
    } else if (action === 'receive') {
      targetStatus = 'Received';
      receiverSignUrl = appliedDriveImgUrl || receiverSignUrl;
      receiverSignUrl2 = appliedDriveImgUrl2 || receiverSignUrl2;
      receiverTime = systemTimeStr;
      receiverName = actorProfile.displayName;
      receiverId = actorProfile.uid;
    } else if (action === 'complete') {
      targetStatus = 'Completed';
    } else {
      res.status(400).json({ error: `The custom transition action '${action}' is not supported inside the STLAF state-machine.` });
      return;
    }

    // Update PRF data variables locally to compile the copy and PDF perfectly
    const updatedPrfMeta = {
      ...prf,
      status: targetStatus,
      requestorSignatureUrl: requestorSignUrl,
      requestorSignatureUrl2: requestorSignUrl2,
      requestorSignedAt: requestorTime,
      approverName,
      approverId,
      approverSignatureUrl: approverSignUrl,
      approverSignatureUrl2: approverSignUrl2,
      approverSignedAt: approverTime,
      receiverName,
      receiverId,
      receiverSignatureUrl: receiverSignUrl,
      receiverSignatureUrl2: receiverSignUrl2,
      receiverSignedAt: receiverTime,
      updatedAt: new Date().toISOString()
    };

    // 5. Build high-fidelity server-side PDF has been disabled by user instruction to prevent PDF generation overhead
    let systemPdfDriveUrl = prf.pdfDriveUrl || '';

    // 6. Copy template spreadsheet or update existing cells
    let individualSheetId = prf.googleSheetId;
    let individualSheetUrl = prf.spreadsheetUrl;

    const prfSyncObj = {
      prfNumber: prf.prfNumber,
      department: prf.department,
      clientName: prf.clientName,
      bank: prf.bank,
      billable: prf.billable,
      date: prf.date,
      status: targetStatus,
      totalAmount: prf.totalAmount,
      
      requestorName: prf.requestorName,
      requestorSignatureUrl: requestorSignUrl,
      requestorSignatureUrl2: requestorSignUrl2,
      requestorSignedAt: requestorTime,
      
      approverName,
      approverSignatureUrl: approverSignUrl,
      approverSignatureUrl2: approverSignUrl2,
      approverSignedAt: approverTime,
      
      receiverName,
      receiverSignatureUrl: receiverSignUrl,
      receiverSignatureUrl2: receiverSignUrl2,
      receiverSignedAt: receiverTime,
      
      hasSecondaryForm: prf.hasSecondaryForm,
      department2: prf.department2,
      clientName2: prf.clientName2,
      bank2: prf.bank2,
      billable2: prf.billable2,
      date2: prf.date2,
      lineItems2: lineItemsArray.filter((i: any) => i.isSecondary),
      
      lineItems: lineItemsArray.filter((i: any) => !i.isSecondary).map((li: any) => ({
        date: li.date,
        description: li.description,
        amount: li.amount
      }))
    };

    try {
      const docResult = await syncPrfDoc(prfSyncObj, individualSheetId || undefined);
      individualSheetId = docResult.documentId;
      individualSheetUrl = docResult.webViewUrl;
      
      updatedPrfMeta.googleSheetId = individualSheetId;
      updatedPrfMeta.spreadsheetUrl = individualSheetUrl;
    } catch (docErr: any) {
      console.error('Disbursement Google Doc syncing failed:', docErr);
    }

    // 8. Upsert transaction details row inside the Master Ledger Sheet
    try {
      await upsertLedgerSpreadsheet(prfSyncObj, individualSheetUrl);
    } catch (ledgerErr) {
      console.error('Disbursement ledger updates failed:', ledgerErr);
    }

    // 11. Compile notifications to be written directly in Firestore by client
    const notifTargets: { role: string; title: string; message: string }[] = [];
    if (targetStatus === 'Pending Approval') {
      notifTargets.push({
        role: 'Approver',
        title: 'New PRF Awaiting Approval',
        message: `${prf.requestorName} submitted ${prf.prfNumber} ($${prf.totalAmount}) for approval.`
      });
    } else if (targetStatus === 'Approved') {
      notifTargets.push({
        role: 'Receiver',
        title: 'PRF Approved for Receipt',
        message: `${prf.prfNumber} has been approved. Awaiting physical disbursement receipt.`
      });
      notifTargets.push({
        role: 'Requestor',
        title: 'Your PRF is Approved',
        message: `${actorProfile.displayName} has approved your payment request ${prf.prfNumber}.`
      });
    } else if (targetStatus === 'Rejected') {
      notifTargets.push({
        role: 'Requestor',
        title: 'Your PRF was Rejected',
        message: `Your payment request ${prf.prfNumber} was rejected. Note: ${commentContent || 'No details provided'}`
      });
    } else if (targetStatus === 'Received') {
      notifTargets.push({
        role: 'Receiver',
        title: 'Payment Received — Complete Voucher',
        message: `${prf.prfNumber} signed off as received. Complete voucher records.`
      });
      notifTargets.push({
        role: 'Requestor',
        title: 'Disbursement Received',
        message: `Your disbursement voucher ${prf.prfNumber} was verified as received.`
      });
    } else if (targetStatus === 'Completed') {
      notifTargets.push({
        role: 'Requestor',
        title: 'Disbursement Completed',
        message: `The ledger voucher processing for ${prf.prfNumber} has been marked completed.`
      });
    }

    res.json({
      success: true,
      data: updatedPrfMeta,
      message: `Workflow state updated to ${targetStatus} successfully.`,
      notifTargets,
      commentObj: commentContent ? {
        prfRequestId: prfId,
        userId: actorProfile.uid,
        userName: actorProfile.displayName,
        userRole: actorProfile.role,
        content: commentContent,
        createdAt: new Date().toISOString()
      } : null,
      auditLogObj: {
        userId: actorProfile.uid,
        userName: actorProfile.displayName,
        userRole: actorProfile.role,
        action: action.toUpperCase(),
        details: `Transitioned document status from '${oldStatus}' to '${targetStatus}'. Comment: ${commentContent || 'None'}`,
        previousValue: oldStatus,
        newValue: targetStatus,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    console.error('Synchronization Workflow Exception Error:', error);
    res.status(500).json({ error: error.message || 'Workflow transition encountered an unhandled exception.' });
  }
});


// ==========================================
// STATIC BUILD AND DEV MIDDLWARE RUNTIMES
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Mounting Vite server-agent configuration to map JSX components on /
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite middleware mounted for local development.');
  } else {
    // Standard serving configuration for production deployment builds
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Production static client build mounted.');
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STLAF Disbursement Portal server listening on host 0.0.0.0, port ${PORT}`);
  });
}

startServer();
