import { google } from 'googleapis';
import { getAuthClient, getFolderId, getTemplateId } from './googleAuth';
import { queueGoogleApiCall } from './queueUtils';
import { PRFSyncPayload } from '../src/types';

/**
 * Converts column index (0, 1, 2...) to spreadsheet letters (A, B, C...)
 */
function colIndexToLabel(col: number): string {
  let columnName = '';
  let tempCol = col + 1;
  while (tempCol > 0) {
    const modulo = (tempCol - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    tempCol = Math.floor((tempCol - modulo) / 26);
  }
  return columnName;
}

/**
 * Scans the first sheet of the copied template, replacements all matching {{placeholders}} 
 * dynamically (supporting substring matches) and fills line items at mapped placeholder columns.
 */
async function customizeSpreadsheetPlaceholders(sheets: any, spreadsheetId: string, prfData: PRFSyncPayload) {
  // 1. Read first sheet content (A1:Z100)
  let rows: string[][] = [];
  let sheetName = 'Sheet1';

  try {
    const spreadsheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const firstSheet = spreadsheetMeta.data.sheets?.[0];
    if (firstSheet?.properties?.title) {
      sheetName = firstSheet.properties.title;
    }
  } catch (metaErr) {
    console.warn('Could not read sheet name for absolute coordinates, defaulting to Sheet1:', metaErr);
  }

  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Z100`,
    });
    rows = res.data.values || [];
  } catch (err) {
    console.error('Failed to read template sheet values for placeholder matching:', err);
    return;
  }

  // FIX 1: All values guarded with ?? '' to prevent undefined/null corrupting join() calls
  const textReplacements: Record<string, string> = {
    // PRF attributes
    '{{prfNumber}}': prfData.prfNumber ?? '',
    '{{prf_number}}': prfData.prfNumber ?? '',
    '{{PRF_NUMBER}}': prfData.prfNumber ?? '',
    '{{PRF Number}}': prfData.prfNumber ?? '',
    '{{PRF}}': prfData.prfNumber ?? '',

    '{{department}}': prfData.department ?? '',
    '{{Department}}': prfData.department ?? '',

    '{{clientName}}': prfData.clientName ?? '',
    '{{client_name}}': prfData.clientName ?? '',
    '{{Client Name}}': prfData.clientName ?? '',
    '{{Client}}': prfData.clientName ?? '',

    '{{bank}}': prfData.bank ?? '',
    '{{Bank}}': prfData.bank ?? '',
    '{{bankName}}': prfData.bank ?? '',
    '{{bank_name}}': prfData.bank ?? '',

    '{{date}}': prfData.date ?? '',
    '{{Date}}': prfData.date ?? '',

    '{{billable}}': prfData.billable ? 'Yes' : 'No',
    '{{Billable}}': prfData.billable ? 'Yes' : 'No',

    '{{totalAmount}}': prfData.totalAmount?.toString() ?? '',
    '{{total_amount}}': prfData.totalAmount?.toString() ?? '',
    '{{Total Amount}}': prfData.totalAmount?.toString() ?? '',
    '{{grandTotal}}': prfData.totalAmount?.toString() ?? '',
    '{{grand_total}}': prfData.totalAmount?.toString() ?? '',

    // Requestor signatures/dates
    '{{requestorName}}': prfData.requestorName ?? '',
    '{{requestor_name}}': prfData.requestorName ?? '',
    '{{Requestor Name}}': prfData.requestorName ?? '',
    '{{Requestor_Name}}': prfData.requestorName ?? '',

    '{{requestorSignature}}': prfData.requestorSignatureUrl ? `=IMAGE("${prfData.requestorSignatureUrl}")` : '',
    '{{requestor_signature}}': prfData.requestorSignatureUrl ? `=IMAGE("${prfData.requestorSignatureUrl}")` : '',
    '{{Requestor Signature}}': prfData.requestorSignatureUrl ? `=IMAGE("${prfData.requestorSignatureUrl}")` : '',
    '{{Signature1}}': prfData.requestorSignatureUrl ? `=IMAGE("${prfData.requestorSignatureUrl}")` : '',

    '{{requestorSignedAt}}': prfData.requestorSignedAt ?? '',
    '{{requestor_signed_at}}': prfData.requestorSignedAt ?? '',
    '{{Requestor Signed At}}': prfData.requestorSignedAt ?? '',
    '{{Date1}}': prfData.requestorSignedAt ?? '',

    // Approver signatures/dates
    '{{approverName}}': prfData.approverName ?? '',
    '{{approver_name}}': prfData.approverName ?? '',
    '{{Approver Name}}': prfData.approverName ?? '',
    '{{Approver_Name}}': prfData.approverName ?? '',

    '{{approverSignature}}': prfData.approverSignatureUrl ? `=IMAGE("${prfData.approverSignatureUrl}")` : '',
    '{{approver_signature}}': prfData.approverSignatureUrl ? `=IMAGE("${prfData.approverSignatureUrl}")` : '',
    '{{Approver Signature}}': prfData.approverSignatureUrl ? `=IMAGE("${prfData.approverSignatureUrl}")` : '',
    '{{Signature2}}': prfData.approverSignatureUrl ? `=IMAGE("${prfData.approverSignatureUrl}")` : '',

    '{{approverSignedAt}}': prfData.approverSignedAt ?? '',
    '{{approver_signed_at}}': prfData.approverSignedAt ?? '',
    '{{Approver Signed At}}': prfData.approverSignedAt ?? '',
    '{{Date2}}': prfData.approverSignedAt ?? '',

    // Receiver signatures/dates
    '{{receiverName}}': prfData.receiverName ?? '',
    '{{receiver_name}}': prfData.receiverName ?? '',
    '{{Receiver Name}}': prfData.receiverName ?? '',
    '{{Received_By}}': prfData.receiverName ?? '',

    '{{receiverSignature}}': prfData.receiverSignatureUrl ? `=IMAGE("${prfData.receiverSignatureUrl}")` : '',
    '{{receiver_signature}}': prfData.receiverSignatureUrl ? `=IMAGE("${prfData.receiverSignatureUrl}")` : '',
    '{{Receiver Signature}}': prfData.receiverSignatureUrl ? `=IMAGE("${prfData.receiverSignatureUrl}")` : '',
    '{{Signature3}}': prfData.receiverSignatureUrl ? `=IMAGE("${prfData.receiverSignatureUrl}")` : '',

    '{{receiverSignedAt}}': prfData.receiverSignedAt ?? '',
    '{{receiver_signed_at}}': prfData.receiverSignedAt ?? '',
    '{{Receiver Signed At}}': prfData.receiverSignedAt ?? '',
    '{{Date3}}': prfData.receiverSignedAt ?? '',
  };

  // Keep track of any found line-items placeholder columns and start row
  let itemDateCol: number | null = null;
  let itemDescCol: number | null = null;
  let itemAmtCol: number | null = null;
  let lineItemsStartRow: number | null = null;

  const updateRequests: { range: string; values: any[][] }[] = [];

  // Scan all cells
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    
    // Check if this row is the line-items headers row
    let rowHasDateHeader = false;
    let rowHasDescHeader = false;
    let rowHasAmtHeader = false;
    let tempDateCol = -1;
    let tempDescCol = -1;
    let tempAmtCol = -1;

    for (let c = 0; c < row.length; c++) {
      const cellValue = String(row[c] || '').trim();

      // Check for line-item placeholder keys
      if (cellValue.includes('{{itemDate}}') || cellValue.includes('{{item_date}}')) {
        itemDateCol = c;
        if (lineItemsStartRow === null) lineItemsStartRow = r;
      }
      if (cellValue.includes('{{itemDescription}}') || cellValue.includes('{{itemDesc}}') || cellValue.includes('{{item_desc}}') || cellValue.includes('{{item_description}}')) {
        itemDescCol = c;
        if (lineItemsStartRow === null) lineItemsStartRow = r;
      }
      if (cellValue.includes('{{itemAmount}}') || cellValue.includes('{{itemAmt}}') || cellValue.includes('{{item_amount}}')) {
        itemAmtCol = c;
        if (lineItemsStartRow === null) lineItemsStartRow = r;
      }

      // Check for dynamic header match if we haven't matched placeholders
      const lowerVal = cellValue.toLowerCase();
      if (lowerVal === 'date') {
        rowHasDateHeader = true;
        tempDateCol = c;
      } else if (lowerVal.includes('description') || lowerVal.includes('purpose of transaction')) {
        rowHasDescHeader = true;
        tempDescCol = c;
      } else if (lowerVal === 'amount') {
        rowHasAmtHeader = true;
        tempAmtCol = c;
      }

      // FIX 2: Check for normal text replacements (substring replacement!)
      // Formula detection now relies solely on replaceWith.startsWith('=') instead of
      // placeholder.includes('Signature') which broke snake_case variants like {{requestor_signature}}
      let replacedValue = String(row[c] || '');
      let didReplace = false;

      for (const [placeholder, replaceWith] of Object.entries(textReplacements)) {
        if (replacedValue.includes(placeholder)) {
          // If the replacement value is a formula, it must own the entire cell — not be embedded in a string
          if (replaceWith.startsWith('=')) {
            replacedValue = replaceWith;
          } else {
            replacedValue = replacedValue.split(placeholder).join(replaceWith);
          }
          didReplace = true;
        }
      }

      if (didReplace) {
        const cellLabel = `${colIndexToLabel(c)}${r + 1}`;
        updateRequests.push({
          range: `${sheetName}!${cellLabel}`,
          values: [[replacedValue]],
        });
      }
    }

    // Dynamic header detection fallback if no placeholders exist
    if (lineItemsStartRow === null && rowHasDateHeader && rowHasDescHeader && rowHasAmtHeader) {
      itemDateCol = tempDateCol;
      itemDescCol = tempDescCol;
      itemAmtCol = tempAmtCol;
      lineItemsStartRow = r;
      console.log(`Dynamically located table rows at row ${r + 1}. Columns - Date: ${colIndexToLabel(itemDateCol)}, Desc: ${colIndexToLabel(itemDescCol)}, Amt: ${colIndexToLabel(itemAmtCol)}`);
    }
  }

  // If we found any update requests for basic replacements, apply them!
  if (updateRequests.length > 0) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updateRequests,
        },
      });
      console.log(`Successfully completed placeholder replacements in ${sheetName}.`);
    } catch (batchErr) {
      console.error('Error batch updating replaced placeholders:', batchErr);
    }
  }

  // Now, let's insert the line items!
  if (prfData.lineItems?.length) {
    if (lineItemsStartRow !== null) {
      console.log(`Found line item table starting at row ${lineItemsStartRow + 1}`);
      const totalItems = prfData.lineItems.length;
      const itemRowsUpdate: { range: string; values: any[][] }[] = [];

      for (let i = 0; i < totalItems; i++) {
        const item = prfData.lineItems[i];
        const currentRow = lineItemsStartRow + i + 2; // 1-based Row number in spreadsheet, +1 for 0-index row, +1 for header offset
        
        if (itemDateCol !== null) {
          const colLabel = colIndexToLabel(itemDateCol);
          itemRowsUpdate.push({
            range: `${sheetName}!${colLabel}${currentRow}`,
            values: [[item.date]],
          });
        }
        if (itemDescCol !== null) {
          const colLabel = colIndexToLabel(itemDescCol);
          itemRowsUpdate.push({
            range: `${sheetName}!${colLabel}${currentRow}`,
            values: [[item.description]],
          });
        }
        if (itemAmtCol !== null) {
          const colLabel = colIndexToLabel(itemAmtCol);
          itemRowsUpdate.push({
            range: `${sheetName}!${colLabel}${currentRow}`,
            values: [[item.amount]],
          });
        }
      }

      if (itemRowsUpdate.length > 0) {
        try {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data: itemRowsUpdate,
            },
          });
          console.log(`Successfully populated ${totalItems} line items beginning at row ${lineItemsStartRow + 2}`);
        } catch (itemUpdateErr) {
          console.error('Error updating line item ranges:', itemUpdateErr);
        }
      }
    } else {
      // Fallback: put line items at default location Sheet1!A10:CXX
      console.log(`No line item table placeholders found. Falling back to default range starting at A10.`);
      const itemRows = prfData.lineItems.map(item => [
        item.date,
        item.description,
        item.amount,
      ]);
      try {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheetName}!A10:C${10 + itemRows.length - 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: itemRows },
        });
      } catch (fallbackErr) {
        console.error('Error executing fallback line items populate:', fallbackErr);
      }
    }
  }
}

/**
 * Copies the template PRF layout sheet, customizes it with specific PRF metrics, and returns spreadsheet details.
 */
export async function createPrfSpreadsheet(prfData: PRFSyncPayload) {
  return queueGoogleApiCall(async () => {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });

    const TEMPLATE_ID = getTemplateId();
    const FOLDER_ID = getFolderId();

    let spreadsheetId = '';
    let isFallback = false;

    // 1. Copy the template spreadsheet to the specified drive folder, falling back to creating a blank sheet
    try {
      const copy = await drive.files.copy({
        fileId: TEMPLATE_ID,
        supportsAllDrives: true,
        requestBody: {
          name: `PRF_Voucher_${prfData.prfNumber}`,
          parents: FOLDER_ID ? [FOLDER_ID] : undefined,
        },
      });
      spreadsheetId = copy.data.id!;
    } catch (copyError: any) {
      console.warn('Google Drive template copy failed (could be File not found / permission issue). Creating blank sheet fallback...', copyError);
      
      const newSheet = await sheets.spreadsheets.create({
        requestBody: {
          properties: {
            title: `PRF_Voucher_${prfData.prfNumber}`,
          },
        },
      });
      spreadsheetId = newSheet.data.spreadsheetId!;
      isFallback = true;

      // Try to place it in the folder if defined
      if (FOLDER_ID) {
        try {
          await drive.files.update({
            fileId: spreadsheetId,
            addParents: FOLDER_ID,
            supportsAllDrives: true,
            fields: 'id, parents',
          });
        } catch (moveErr) {
          console.warn('Could not move fallback sheet to target folder:', moveErr);
        }
      }
    }

    // 2. Grant public access so anybody can view it, and formulas can read direct-link assets
    try {
      await drive.permissions.create({
        fileId: spreadsheetId,
        supportsAllDrives: true,
        requestBody: { role: 'reader', type: 'anyone' },
      });
    } catch (permError) {
      console.error('Warning: Failed to set public permission on Sheets:', permError);
    }

    // 3. Customize layout (either rich placeholder replace or fallback labels)
    if (!isFallback) {
      await customizeSpreadsheetPlaceholders(sheets, spreadsheetId, prfData);
    } else {
      // Fallback layout creation for blank sheet
      const updateRanges = [
        { range: 'Sheet1!B2', values: [[prfData.prfNumber]] },
        { range: 'Sheet1!B3', values: [[prfData.department]] },
        { range: 'Sheet1!B4', values: [[prfData.clientName]] },
        { range: 'Sheet1!B5', values: [[prfData.bank]] },
        { range: 'Sheet1!B6', values: [[prfData.date]] },
        { range: 'Sheet1!B7', values: [[prfData.billable]] }, // uses real checkbox state
        
        // Requestor signature block
        { range: 'Sheet1!C20', values: [[prfData.requestorName]] },
        { range: 'Sheet1!C21', values: [[
            prfData.requestorSignatureUrl
              ? `=IMAGE("${prfData.requestorSignatureUrl}")`
              : ''
        ]]},
        { range: 'Sheet1!C22', values: [[prfData.requestorSignedAt || '']] },
        
        // Approver signature block
        { range: 'Sheet1!D20', values: [[prfData.approverName ?? '']] },
        { range: 'Sheet1!D21', values: [[
            prfData.approverSignatureUrl
              ? `=IMAGE("${prfData.approverSignatureUrl}")`
              : ''
        ]]},
        { range: 'Sheet1!D22', values: [[prfData.approverSignedAt ?? '']] },
        
        // Receiver signature block
        { range: 'Sheet1!E20', values: [[prfData.receiverName ?? '']] },
        { range: 'Sheet1!E21', values: [[
            prfData.receiverSignatureUrl
              ? `=IMAGE("${prfData.receiverSignatureUrl}")`
              : ''
        ]]},
        { range: 'Sheet1!E22', values: [[prfData.receiverSignedAt ?? '']] },

        { range: 'Sheet1!A2', values: [['PRF Number:']] },
        { range: 'Sheet1!A3', values: [['Department:']] },
        { range: 'Sheet1!A4', values: [['Client Name:']] },
        { range: 'Sheet1!A5', values: [['Bank Name:']] },
        { range: 'Sheet1!A6', values: [['Date:']] },
        { range: 'Sheet1!A7', values: [['Billable:']] },
        
        { range: 'Sheet1!C19', values: [['[Requestor Signature Block]']] },
        { range: 'Sheet1!D19', values: [['[Approver Signature Block]']] },
        { range: 'Sheet1!E19', values: [['[Receiver Signature Block]']] },

        { range: 'Sheet1!A9:C9', values: [['Item Date', 'Description', 'Amount']] }
      ];

      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        requestBody: {
          valueInputOption: 'USER_ENTERED',
          data: updateRanges,
        },
      });

      // Fill line items in fallback beginning at row A10
      if (prfData.lineItems?.length) {
        const itemRows = prfData.lineItems.map(item => [
          item.date,
          item.description,
          item.amount,
        ]);
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Sheet1!A10:C${10 + itemRows.length - 1}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: itemRows },
        });
      }
    }

    const webViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return { spreadsheetId, webViewUrl };
  });
}

/**
 * Syncs the current PRF data with its individual copy spreadsheet. If none exists, creates it.
 */
export async function syncPrfSpreadsheet(
  prfData: PRFSyncPayload,
  existingSpreadsheetId?: string
) {
  if (!existingSpreadsheetId) {
    // Spreadsheet does not exist yet. Create a fresh sheet from template.
    return createPrfSpreadsheet(prfData);
  }

  // File exists. Delete it first to avoid duplicate outdated copies, and replace with fresh full copy
  try {
    await queueGoogleApiCall(async () => {
      const auth = getAuthClient();
      const drive = google.drive({ version: 'v3', auth });
      await drive.files.delete({ fileId: existingSpreadsheetId, supportsAllDrives: true });
      console.log(`Deleted outdated spreadsheet ${existingSpreadsheetId} to replace with fresh sync.`);
    });
  } catch (deleteErr) {
    console.warn(`Could not delete outdated spreadsheet ${existingSpreadsheetId} (it might have been deleted manually). Proceeding with fresh creation...`, deleteErr);
  }

  return createPrfSpreadsheet(prfData);
}

/**
 * Helper to locate or create a spreadsheet named "Disbursement_Master_Ledger" inside user's designated Google Drive folder.
 */
async function getOrCreateLedgerId(drive: any, sheets: any, folderId: string | undefined): Promise<string> {
  const envLedgerId = process.env.GOOGLE_SHEETS_LEDGER_ID;
  if (envLedgerId) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: envLedgerId });
      return envLedgerId;
    } catch (e) {
      console.warn(`Environment Master Ledger ID ${envLedgerId} is not readable or does not exist. Designing new Master Ledger.`, e);
    }
  }

  // 1. Search Google Drive workspace for 'Disbursement_Master_Ledger'
  try {
    const q = folderId 
      ? `name = 'Disbursement_Master_Ledger' and mimeType = 'application/vnd.google-apps.spreadsheet' and '${folderId}' in parents and trashed = false`
      : `name = 'Disbursement_Master_Ledger' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
    const searchRes = await drive.files.list({
      q,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      fields: 'files(id, name)',
      spaces: 'drive',
    });
    const files = searchRes.data.files || [];
    if (files.length > 0) {
      console.log(`Discovered pre-existing custom Master Ledger in Drive: ${files[0].id}`);
      return files[0].id;
    }
  } catch (searchErr) {
    console.warn('Searching for custom Master Ledger in drive failed; generating fresh one...', searchErr);
  }

  // 2. Not found, create brand new Spreadsheet named 'Disbursement_Master_Ledger'
  console.log('Generating a fresh Master Ledger spreadsheet...');
  const newSpreadsheet = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: 'Disbursement_Master_Ledger',
      },
    },
  });
  const newLedgerId = newSpreadsheet.data.spreadsheetId!;

  if (folderId) {
    try {
      await drive.files.update({
        fileId: newLedgerId,
        addParents: folderId,
        supportsAllDrives: true,
        fields: 'id, parents',
      });
    } catch (moveErr) {
      console.warn('Could not move Master Ledger to folder:', moveErr);
    }
  }

  // Set permissions for reader to anyone
  try {
    await drive.permissions.create({
      fileId: newLedgerId,
      supportsAllDrives: true,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (permErr) {
    console.warn('Could not make custom Master Ledger readable to anyone:', permErr);
  }

  // Initialize header columns properly
  const headers = [
    [
      'PRF No', 'Department', 'Client', 'Bank', 'Billable', 'Status', 'Total Amount', 'Date',
      'Requestor', 'Sig1 URL', 'Date1', 'Approver', 'Sig2 URL', 'Date2', 'Receiver', 'Sig3 URL', 'Date3',
      'Line Items JSON', 'Sheet URL'
    ]
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: newLedgerId,
    range: 'Sheet1!A1:S1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: headers,
    },
  });

  return newLedgerId;
}

/**
 * Syncs the PRF data to the designated master ledger spreadsheet (upsert row).
 */
export async function upsertLedgerSpreadsheet(
  prfData: PRFSyncPayload,
  spreadsheetUrl: string | null
) {
  return queueGoogleApiCall(async () => {
    const auth = getAuthClient();
    const drive = google.drive({ version: 'v3', auth });
    const sheets = google.sheets({ version: 'v4', auth });
    const folderId = getFolderId();

    // Resolve ledger spreadsheet ID dynamically to prevent permission or deleted file crashes
    const ledgerId = await getOrCreateLedgerId(drive, sheets, folderId);

    // 1. Fetch current ledger contents to locate the matching PRF row (searching Column A)
    let rows: any[][] = [];
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: ledgerId,
        range: 'Sheet1!A:S',
      });
      rows = response.data.values || [];
    } catch (getErr) {
      console.warn('Master Ledger range read failed or was empty; starting fresh...', getErr);
    }

    const lineItemsJson = JSON.stringify(prfData.lineItems || []);
    
    // Construct values array conforming exactly to:
    // PRF No | Department | Client | Bank | Billable | Status | Total Amount | Date |
    // Requestor | Sig1 URL | Date1 | Approver | Sig2 URL | Date2 | Receiver | Sig3 URL | Date3 |
    // Line Items JSON | Sheet URL
    const rowData = [
      prfData.prfNumber,                                // Col A (0)
      prfData.department,                               // Col B (1)
      prfData.clientName,                               // Col C (2)
      prfData.bank,                                     // Col D (3)
      prfData.billable ? 'TRUE' : 'FALSE',              // Col E (4)
      prfData.status,                                   // Col F (5)
      prfData.totalAmount,                              // Col G (6)
      prfData.date,                                     // Col H (7)
      prfData.requestorName,                            // Col I (8)
      prfData.requestorSignatureUrl || '',              // Col J (9)
      prfData.requestorSignedAt || '',                  // Col K (10)
      prfData.approverName || '',                       // Col L (11)
      prfData.approverSignatureUrl || '',               // Col M (12)
      prfData.approverSignedAt || '',                   // Col N (13)
      prfData.receiverName || '',                       // Col O (14)
      prfData.receiverSignatureUrl || '',               // Col P (15)
      prfData.receiverSignedAt || '',                   // Col Q (16)
      lineItemsJson,                                    // Col R (17)
      spreadsheetUrl || '',                             // Col S (18)
    ];

    let rowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i][0] === prfData.prfNumber) {
        rowIndex = i + 1; // 1-indexed conversion
        break;
      }
    }

    if (rowIndex !== -1) {
      // Perform targeted row update
      await sheets.spreadsheets.values.update({
        spreadsheetId: ledgerId,
        range: `Sheet1!A${rowIndex}:S${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });
      console.log(`Successfully updated Master Ledger at row ${rowIndex} for ${prfData.prfNumber}`);
    } else {
      // Append row to bottom of sheet
      await sheets.spreadsheets.values.append({
        spreadsheetId: ledgerId,
        range: 'Sheet1!A:S',
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData],
        },
      });
      console.log(`Successfully appended Master Ledger row for ${prfData.prfNumber}`);
    }
  });
}