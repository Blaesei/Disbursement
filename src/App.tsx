import { useState, useEffect } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
  writeBatch,
  orderBy
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { handleFirestoreError, OperationType } from './lib/firebaseErrors';
import { PrfRequest, UserProfile, PrfLineItem, PrfComment, PrfNotification, AuditLog, UserRole } from './types';
import DashboardView from './components/DashboardView';
import PrfFormView from './components/PrfFormView';
import PrfDetailView from './components/PrfDetailView';
import AdminSettingsView from './components/AdminSettingsView';
import { 
  ShieldCheck, 
  Layers, 
  LogOut, 
  Chrome, 
  HelpCircle, 
  FileLock2, 
  SlidersHorizontal,
  FileSpreadsheet,
  AlertCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

export default function App() {
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'new-request' | 'edit-request' | 'detail' | 'admin'>('dashboard');
  const [isSidebarMini, setIsSidebarMini] = useState(false);
  
  // Auth & Profile state
  const [fbUser, setFbUser] = useState<FirebaseUser | null>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Database snapshot arrays
  const [prfRequests, setPrfRequests] = useState<PrfRequest[]>([]);
  const [lineItems, setLineItems] = useState<PrfLineItem[]>([]);
  const [comments, setComments] = useState<PrfComment[]>([]);
  const [notifications, setNotifications] = useState<PrfNotification[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [allUsersProfile, setAllUsersProfile] = useState<UserProfile[]>([]);

  // Selected document context
  const [selectedPrfId, setSelectedPrfId] = useState<string | null>(null);

  // Server Diagnostics
  const [googleConfigured, setGoogleConfigured] = useState<boolean | null>(null);
  const [configKeys, setConfigKeys] = useState<any>(null);

  // Diagnostics check on mount
  const checkDiagnostics = async () => {
    try {
      const response = await fetch('/api/auth/validate-config');
      const data = await response.json();
      setGoogleConfigured(data.googleConfigured);
      setConfigKeys(data.environmentKeys);
    } catch (err) {
      console.warn('Diagnostics polling failed:', err);
    }
  };

  useEffect(() => {
    checkDiagnostics();
  }, []);

  // 1. Listen for user authentication changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFbUser(user);
      if (user) {
        // Fetch or create user Profile in Firestore /users/{userId}
        const userRef = doc(db, 'users', user.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          // Determine requested role based on email mapping
          let targetRole: UserRole | null = null;
          if (user.email) {
            const emailClean = user.email.toLowerCase().trim();
            if (emailClean === 'mike.paras272@gmail.com') {
              targetRole = 'Receiver';
            } else if (emailClean === 'damoncrz2872@gmail.com') {
              targetRole = 'Administrator';
            } else if (emailClean === 'quinn.pinedatktk@gmail.com') {
              targetRole = 'Receiver';
            }
          }

          if (userSnap.exists()) {
            const profile = userSnap.data() as UserProfile;
            if (targetRole && profile.role !== targetRole) {
              const updatedProfile = { ...profile, role: targetRole };
              await updateDoc(userRef, { role: targetRole });
              setCurrentUserProfile(updatedProfile);
            } else {
              setCurrentUserProfile(profile);
            }
          } else {
            // New register profile setup.
            const newRole: UserRole = targetRole || 'Requestor';
            const newProfile: UserProfile = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Anonymous User',
              role: newRole,
              signatureUrl: null,
              isActive: true,
              createdAt: new Date().toISOString()
            };
            await setDoc(userRef, newProfile);
            setCurrentUserProfile(newProfile);
          }
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        }
      } else {
        setCurrentUserProfile(null);
      }
      setLoadingAuth(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Load Real-time table snapshot synchronizations when logged in
  useEffect(() => {
    if (!fbUser) return;

    // Prf requests snapshots
    const unsubscribePrfs = onSnapshot(collection(db, 'prf_requests'), (snapshot) => {
      const list: PrfRequest[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as PrfRequest);
      });
      // Sort newest requests first
      list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      setPrfRequests(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'prf_requests');
    });

    // Particulars line snapshots
    const unsubscribeItems = onSnapshot(collection(db, 'prf_line_items'), (snapshot) => {
      const list: PrfLineItem[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as PrfLineItem);
      });
      setLineItems(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'prf_line_items');
    });

    // Discussion comments snapshots
    const unsubscribeComments = onSnapshot(collection(db, 'comments'), (snapshot) => {
      const list: PrfComment[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as PrfComment);
      });
      list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
      setComments(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'comments');
    });

    // Notifications snapshots - securely filter by authenticated user ID
    const unsubscribeNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', fbUser.uid)),
      (snapshot) => {
        const list: PrfNotification[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as PrfNotification);
        });
        list.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
        setNotifications(list);
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );

    // Master Audit ledger snapshots - ONLY listen if the user has a privileged profile
    let unsubscribeAudit = () => {};
    if (currentUserProfile && (
      currentUserProfile.role === 'Administrator' ||
      currentUserProfile.role === 'Approver' ||
      currentUserProfile.role === 'Receiver'
    )) {
      unsubscribeAudit = onSnapshot(collection(db, 'audit_logs'), (snapshot) => {
        const list: AuditLog[] = [];
        snapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as AuditLog);
        });
        list.sort((a,b) => b.timestamp.localeCompare(a.timestamp));
        setAuditLogs(list);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, 'audit_logs');
      });
    }

    // User profiles snapshots
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((doc) => {
        list.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setAllUsersProfile(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribePrfs();
      unsubscribeItems();
      unsubscribeComments();
      unsubscribeNotifs();
      unsubscribeAudit();
      unsubscribeUsers();
    };
  }, [fbUser, currentUserProfile]);

  const handleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.error('Sign-in failure:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setAuthError('The sign-in popup was closed before completion. Please try again.');
      } else if (err?.code === 'auth/configuration-not-found') {
        setAuthError('Google Auth Provider is not enabled/configured in your Firebase Console. Please register Google Sign-in under the Auth tab.');
      } else {
        setAuthError(err?.message || 'An unexpected sign-in error occurred.');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setView('dashboard');
    } catch (err) {
      console.error('Sign-out failure:', err);
    }
  };

  // Test Profile Impersonation (Instant role selector swaps)
  const impersonateUser = async (uid: string) => {
    const userRef = doc(db, 'users', uid);
    try {
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        setCurrentUserProfile(userSnap.data() as UserProfile);
        console.log(`Testing profile swapped to: ${userSnap.data()?.displayName}`);
      }
    } catch (err) {
      console.error('Impersonation read failure:', err);
    }
  };

  // Mark notification as read
  const markNotificationRead = async (notifId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notifId), { isRead: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `notifications/${notifId}`);
    }
  };

  // Form submit handler
  const handlePrfSubmit = async (
    formData: any,
    itemsPayload: Omit<PrfLineItem, 'id' | 'prfRequestId'>[],
    signatureDataUrl: string | null,
    previewDocumentData?: { id: string, url: string },
    signatureDataUrl2?: string | null
  ) => {
    if (!fbUser || !currentUserProfile) return;

    const prfId = formData.prfNumber.replace(/[^A-Za-z0-9]/g, '');
    const isEditing = !!selectedPrfId;
    const targetPrfId = isEditing ? selectedPrfId! : prfId;

    // 1. Save line items to Firestore first
    // In case of editing, we clear previous line items associated with this request and replace them
    if (isEditing) {
      const linesToDeleteSnap = await getDocs(
        query(collection(db, 'prf_line_items'), where('prfRequestId', '==', targetPrfId))
      );
      const batch = writeBatch(db);
      linesToDeleteSnap.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    }

    // Write new line items
    for (const item of itemsPayload) {
      const itemDocId = `item_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      await setDoc(doc(db, 'prf_line_items', itemDocId), {
        id: itemDocId,
        prfRequestId: targetPrfId,
        date: item.date,
        description: item.description,
        amount: item.amount,
        isSecondary: false
      });
    }

    // Write secondary line items if present
    if (formData.hasSecondaryForm && formData.lineItems2) {
      for (const item of formData.lineItems2) {
        const itemDocId = `item2_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        await setDoc(doc(db, 'prf_line_items', itemDocId), {
          id: itemDocId,
          prfRequestId: targetPrfId,
          date: item.date,
          description: item.description,
          amount: item.amount,
          isSecondary: true
        });
      }
    }

    // 2. Save PRF request basic metadata
    if (isEditing) {
      const prfRef = doc(db, 'prf_requests', targetPrfId);
      const updates: any = {
        department: formData.department,
        clientName: formData.clientName,
        bank: formData.bank,
        billable: formData.billable,
        date: formData.date,
        totalAmount: formData.totalAmount,
        updatedAt: new Date().toISOString(),
        
        hasSecondaryForm: formData.hasSecondaryForm || false,
        department2: formData.department2 || null,
        clientName2: formData.clientName2 || null,
        bank2: formData.bank2 || null,
        billable2: formData.billable2 || false,
        date2: formData.date2 || null
      };
      if (previewDocumentData) {
        updates.googleSheetId = previewDocumentData.id;
        updates.spreadsheetUrl = previewDocumentData.url;
      }
      await updateDoc(prfRef, updates);
    } else {
      const nextPrfObj: PrfRequest = {
        id: targetPrfId,
        prfNumber: formData.prfNumber,
        department: formData.department,
        clientName: formData.clientName,
        bank: formData.bank,
        billable: formData.billable,
        date: formData.date,
        status: 'Draft',
        totalAmount: formData.totalAmount,
        createdAt: new Date().toISOString(),
        requestorId: fbUser.uid,
        requestorName: currentUserProfile.displayName,
        requestorSignedAt: null,
        requestorSignatureUrl: null,
        approverId: null,
        approverName: null,
        approverSignedAt: null,
        approverSignatureUrl: null,
        receiverId: null,
        receiverName: null,
        receiverSignedAt: null,
        receiverSignatureUrl: null,
        pdfDriveUrl: null,
        googleSheetId: previewDocumentData?.id || null,
        spreadsheetUrl: previewDocumentData?.url || null,
        hasSecondaryForm: formData.hasSecondaryForm || false,
        department2: formData.department2 || undefined,
        clientName2: formData.clientName2 || undefined,
        bank2: formData.bank2 || undefined,
        billable2: formData.billable2 || undefined,
        date2: formData.date2 || undefined
      };

      await setDoc(doc(db, 'prf_requests', targetPrfId), nextPrfObj);
    }

    // Write primary draft Audit Log
    const draftLogId = `log_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', draftLogId), {
      id: draftLogId,
      userId: fbUser.uid,
      userName: currentUserProfile.displayName,
      userRole: currentUserProfile.role,
      action: isEditing ? 'EDIT_DRAFT' : 'CREATE_DRAFT',
      details: `Saved Payment Request Form ${formData.prfNumber} (₱${formData.totalAmount}) as draft.`,
      previousValue: null,
      newValue: null,
      timestamp: new Date().toISOString()
    });

    // 3. If action is direct SUBMIT, transition states using server coordinator API
    if (formData.submitAction === 'submit') {
      await handleSyncTransition(targetPrfId, 'submit', signatureDataUrl, undefined, signatureDataUrl2);
    }

    // Return to dashboard
    setView('dashboard');
    setSelectedPrfId(null);
  };

  // Synchronous State Transition and triggers
  const handleSyncTransition = async (
    prfId: string,
    action: 'submit' | 'approve' | 'reject' | 'receive' | 'complete',
    signatureDataUrl: string | null,
    commentContent?: string,
    signatureDataUrl2?: string | null
  ) => {
    if (!currentUserProfile) return;

    // Retrieve original record and related line items from React state to pass to stateless server
    let prfRecord = prfRequests.find(r => r.id === prfId);
    let relevantLineItems = lineItems.filter(li => li.prfRequestId === prfId);

    if (!prfRecord) {
      // Fetch directly from Firestore to avoid race condition of onSnapshot update latency
      const prfSnap = await getDoc(doc(db, 'prf_requests', prfId));
      if (prfSnap.exists()) {
        prfRecord = prfSnap.data() as PrfRequest;
      }
    }

    if (!prfRecord) {
      throw new Error('Associated Payment Request Form document not found.');
    }

    if (relevantLineItems.length === 0) {
      // Fetch directly from Firestore to avoid race condition of onSnapshot update latency
      try {
        const q = query(collection(db, 'prf_line_items'), where('prfRequestId', '==', prfId));
        const itemsSnap = await getDocs(q);
        const fetchedItems: PrfLineItem[] = [];
        itemsSnap.forEach((docSnap) => {
          fetchedItems.push(docSnap.data() as PrfLineItem);
        });
        relevantLineItems = fetchedItems;
      } catch (err) {
        console.warn('Fallback fetching line items failed:', err);
      }
    }

    const response = await fetch('/api/prf/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prfId,
        action,
        signatureDataUrl,
        commentContent,
        actorProfile: currentUserProfile,
        prfRecord,
        lineItems: relevantLineItems,
        signatureDataUrl2
      })
    });

    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error || 'Server sync transition pipeline failed.');
    }
    console.log('Transition successful:', body.message);

    // Write updated metadata securely via Firebase Web SDK on the client
    if (body.data) {
      await setDoc(doc(db, 'prf_requests', prfId), body.data);
    }

    // Write comment locally if any returned
    if (body.commentObj) {
      const commentId = `comment_${Date.now()}`;
      await setDoc(doc(db, 'comments', commentId), {
        ...body.commentObj,
        id: commentId
      });
    }

    // Write audit log safely
    if (body.auditLogObj) {
      const logId = `log_${Date.now()}`;
      await setDoc(doc(db, 'audit_logs', logId), {
        ...body.auditLogObj,
        id: logId
      });
    }

    // Build notifications safely for each target user
    if (body.notifTargets && body.notifTargets.length > 0) {
      for (const t of body.notifTargets) {
        const targetUsers = allUsersProfile.filter(u => u.role === t.role);
        for (const u of targetUsers) {
          const nId = `notif_${Date.now()}_${u.uid.substring(0, 5)}_${Math.random().toString(36).substring(2, 5)}`;
          await setDoc(doc(db, 'notifications', nId), {
            id: nId,
            userId: u.uid,
            title: t.title,
            message: t.message,
            isRead: false,
            prfId: prfId,
            createdAt: new Date().toISOString()
          });
        }
      }
    }
  };

  const handleDeletePrf = async (prfId: string) => {
    if (!fbUser || !currentUserProfile) return;
    
    try {
      const batch = writeBatch(db);
      
      // Delete PRF
      batch.delete(doc(db, 'prf_requests', prfId));
      
      // Delete Line Items
      const lineItemsSnap = await getDocs(query(collection(db, 'prf_line_items'), where('prfRequestId', '==', prfId)));
      lineItemsSnap.forEach((d) => batch.delete(d.ref));
      
      // Delete Comments
      const commentsSnap = await getDocs(query(collection(db, 'comments'), where('prfRequestId', '==', prfId)));
      commentsSnap.forEach((d) => batch.delete(d.ref));
      
      // Delete Audit Logs
      const auditLogSnap = await getDocs(query(collection(db, 'audit_logs'), where('prfId', '==', prfId)));
      auditLogSnap.forEach((d) => batch.delete(d.ref));
      
      // Delete Notifications
      const notifSnap = await getDocs(query(collection(db, 'notifications'), where('prfId', '==', prfId)));
      notifSnap.forEach((d) => batch.delete(d.ref));

      await batch.commit();
      setView('dashboard');
      setSelectedPrfId(null);
    } catch (err) {
      console.error('Failed to delete PRF:', err);
      handleFirestoreError(err, OperationType.WRITE, `prf_requests/${prfId}`);
    }
  };

  // Post Discussion Comment
  const handlePostComment = async (content: string) => {
    if (!selectedPrfId || !currentUserProfile) return;
    const cId = `comment_${Date.now()}`;
    await setDoc(doc(db, 'comments', cId), {
      id: cId,
      prfRequestId: selectedPrfId,
      userId: currentUserProfile.uid,
      userName: currentUserProfile.displayName,
      userRole: currentUserProfile.role,
      content,
      createdAt: new Date().toISOString()
    });
  };

  // Promote User admin tools (Client-side writes secured by Firestore Rules)
  const handlePromoteAdmin = async (targetUid: string, role: UserRole) => {
    if (!currentUserProfile) return;
    
    // Perform update in Firestore directly, backed up by backend metadata validation
    await updateDoc(doc(db, 'users', targetUid), {
      role,
      updatedAt: new Date().toISOString()
    });

    // Mirror to backend log endpoint if exists, but we are self-sufficient
    await fetch('/api/admin/promote-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        targetUid,
        newRole: role
      })
    });

    // Write an audit log for the action
    const logId = `log_${Date.now()}`;
    await setDoc(doc(db, 'audit_logs', logId), {
      id: logId,
      userId: currentUserProfile.uid,
      userName: currentUserProfile.displayName,
      userRole: currentUserProfile.role,
      action: 'PROMOTE',
      details: `Promoted profile ${targetUid} to the '${role}' role directly.`,
      timestamp: new Date().toISOString()
    });
  };

  // Generate next sequential PRF number (e.g. PRF-2026-0001)
  const getNextPrfNumber = () => {
    const year = new Date().getFullYear();
    const matchesPrefix = `PRF-${year}-`;
    const filtered = prfRequests.filter(r => r.prfNumber.startsWith(matchesPrefix));
    if (filtered.length === 0) return `${matchesPrefix}0001`;
    
    // Extract sequence numbers
    const sequences = filtered.map(r => {
      const parts = r.prfNumber.split('-');
      const numStr = parts[parts.length - 1];
      return parseInt(numStr, 10) || 0;
    });

    const maxSeq = Math.max(...sequences);
    const nextSeq = maxSeq + 1;
    return `${matchesPrefix}${String(nextSeq).padStart(4, '0')}`;
  };

  if (loadingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#F8FAFC] font-sans">
        <Layers className="w-10 h-10 text-[#1E2D5A] animate-spin mb-3" />
        <h4 className="text-xs font-bold text-slate-650 tracking-wider uppercase select-none">STLAF DISBURSEMENT PORTAL INDENTITY HANDSHAKE...</h4>
      </div>
    );
  }

  // Auth gate screen
  if (!fbUser || !currentUserProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F8FAFC] p-4 font-sans text-slate-800">
        <div className="w-full max-w-md border border-slate-200 bg-white rounded-3xl p-6 shadow-xl flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <span className="p-3.5 bg-indigo-50 text-[#1E2D5A] rounded-2xl mb-4">
              <FileLock2 className="w-12 h-12" />
            </span>
            <h1 className="text-lg font-black tracking-tight text-[#1E2D5A]">STLAF PAYMENT REQUEST PORTAL</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
              Disbursement Authorization Platform. Authenticate with your corporate Google Account credentials to proceed.
            </p>
          </div>

          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-850 rounded-2xl text-xs flex gap-2 items-start leading-relaxed animate-fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Authentication Issue</span>
                <span>{authError}</span>
              </div>
            </div>
          )}

          <div className="h-[1px] bg-slate-100" />

          <button
            onClick={handleSignIn}
            className="w-full flex items-center justify-center gap-2.5 px-4 py-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-xl text-xs font-semibold focus:outline-hidden active:scale-98 transition shadow-xs cursor-pointer select-none"
          >
            <Chrome className="w-4 h-4 text-blue-500" /> Google Sign-In (Preview Popup)
          </button>
          
          <p className="text-[10px] text-slate-400 text-center italic leading-relaxed">
            By authenticating, you register your workspace profile under standard auditing policies naturally.
          </p>
        </div>
      </div>
    );
  }

  const getInitials = (name: string) => {
    if (!name) return 'JD';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };
  const initials = getInitials(currentUserProfile ? currentUserProfile.displayName : '');

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans flex flex-col md:flex-row overflow-hidden text-[#1E293B]">
      
      {/* 1. Desktop Left Sidebar (Visible on md and above) */}
      <aside className={`${isSidebarMini ? 'w-20' : 'w-64'} bg-[#1E2D5A] hidden md:flex flex-col border-r border-[#152044] shrink-0 select-none transition-all duration-300 ease-in-out relative`}>
        <button
          onClick={() => setIsSidebarMini(!isSidebarMini)}
          className="absolute -right-3 top-6 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-700 shadow-sm z-10 cursor-pointer transition-transform hover:scale-110"
        >
          {isSidebarMini ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        <div 
          onClick={() => { setView('dashboard'); setSelectedPrfId(null); }} 
          className={`p-6 mb-4 cursor-pointer hover:opacity-90 transition select-none group flex flex-col ${isSidebarMini ? 'items-center px-2 py-6' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-white rounded flex items-center justify-center shrink-0 group-hover:scale-105 transition">
              <div className="w-5 h-5 border-2 border-[#1E2D5A]"></div>
            </div>
            {!isSidebarMini && <h1 className="text-white font-bold tracking-tight text-lg font-display group-hover:text-blue-100 transition whitespace-nowrap">STLAF PORTAL</h1>}
          </div>
          {!isSidebarMini && <p className="text-blue-200 text-[10px] mt-1 font-medium tracking-widest uppercase truncate w-full text-left">Disbursement System</p>}
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-hidden">
          <button 
            onClick={() => { setView('dashboard'); setSelectedPrfId(null); }}
            className={`w-full flex items-center gap-3 p-3 rounded-lg border transition duration-150 cursor-pointer text-left ${
              view === 'dashboard' || view === 'detail' || view === 'edit-request'
                ? 'bg-white/10 text-white border-white/5'
                : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent'
            } ${isSidebarMini ? 'justify-center' : ''}`}
            title={isSidebarMini ? "Dashboard" : undefined}
          >
            <div className={`w-4 h-4 rounded-sm transition shrink-0 ${
              view === 'dashboard' || view === 'detail' || view === 'edit-request' ? 'bg-white/30' : 'border border-white/20'
            }`} />
            {!isSidebarMini && <span className="text-sm font-medium whitespace-nowrap">Dashboard</span>}
          </button>

          {(currentUserProfile?.role === 'Requestor' || currentUserProfile?.role === 'Administrator') && (
            <button 
              onClick={() => { setSelectedPrfId(null); setView('new-request'); }}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition duration-150 cursor-pointer text-left ${
                view === 'new-request' && !selectedPrfId
                  ? 'bg-white/10 text-white border-white/5'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent'
              } ${isSidebarMini ? 'justify-center' : ''}`}
              title={isSidebarMini ? "New Request" : undefined}
            >
              <div className={`w-4 h-4 rounded-sm transition shrink-0 ${
                view === 'new-request' && !selectedPrfId ? 'bg-white/30' : 'border border-white/20'
              }`} />
              {!isSidebarMini && <span className="text-sm font-medium whitespace-nowrap">New Request</span>}
            </button>
          )}

          {currentUserProfile?.role === 'Administrator' && (
            <button 
              onClick={() => setView('admin')}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border transition duration-150 cursor-pointer text-left ${
                view === 'admin'
                  ? 'bg-white/10 text-white border-white/5'
                  : 'text-white/60 hover:text-white hover:bg-white/5 border-transparent'
              } ${isSidebarMini ? 'justify-center' : ''}`}
              title={isSidebarMini ? "Admin Console" : undefined}
            >
              <div className={`w-4 h-4 rounded-sm transition shrink-0 ${
                view === 'admin' ? 'bg-white/30' : 'border border-white/20'
              }`} />
              {!isSidebarMini && <span className="text-sm font-medium whitespace-nowrap">Admin Console</span>}
            </button>
          )}
        </nav>

        <div className={`p-6 bg-[#182449] border-t border-[#141d3b] ${isSidebarMini ? 'px-2 py-6 flex justify-center' : ''}`}>
          <div className={`flex items-center ${isSidebarMini ? 'justify-center w-full' : 'gap-3'}`}>
            <div className="w-10 h-10 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold shadow-xs shrink-0 select-none">
              {initials}
            </div>
            {!isSidebarMini && (
              <>
                <div className="overflow-hidden flex-1">
                  <p className="text-sm text-white font-medium truncate" title={currentUserProfile.displayName}>
                    {currentUserProfile.displayName}
                  </p>
                  <p className="text-[10px] text-blue-300 uppercase font-mono tracking-wider">
                    {currentUserProfile.role}
                  </p>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-white/40 hover:text-rose-400 p-1 rounded-md transition cursor-pointer shrink-0"
                  title="Disconnect authentic sessions"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* 2. Mobile Header navigation */}
      <div className="flex md:hidden flex-col bg-[#1E2D5A] text-white shrink-0 border-b border-[#152044] select-none">
        <div className="p-4 flex items-center justify-between">
          <div 
            onClick={() => { setView('dashboard'); setSelectedPrfId(null); }}
            className="flex items-center gap-2 cursor-pointer hover:opacity-90 transition select-none"
          >
            <div className="w-6 h-6 bg-white rounded flex items-center justify-center shrink-0">
              <div className="w-3.5 h-3.5 border-2 border-[#1E2D5A]"></div>
            </div>
            <span className="font-bold tracking-tight text-sm font-display">STLAF PORTAL</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-indigo-200 uppercase font-mono text-[9px] font-bold bg-white/10 px-1.5 py-0.5 rounded">
              {currentUserProfile.role}
            </span>
            <button onClick={handleSignOut} className="p-1 text-slate-300 hover:text-white cursor-pointer" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto text-[11px] whitespace-nowrap scrollbar-none">
          <button
            onClick={() => { setView('dashboard'); setSelectedPrfId(null); }}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              view === 'dashboard' || view === 'detail' || view === 'edit-request' ? 'bg-white text-[#1E2D5A]' : 'bg-white/10 text-white/80'
            }`}
          >
            Dashboard
          </button>
          {(currentUserProfile?.role === 'Requestor' || currentUserProfile?.role === 'Administrator') && (
            <button
              onClick={() => { setSelectedPrfId(null); setView('new-request'); }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                view === 'new-request' && !selectedPrfId ? 'bg-white text-[#1E2D5A]' : 'bg-white/10 text-white/80'
              }`}
            >
              New Request
            </button>
          )}
          {currentUserProfile?.role === 'Administrator' && (
            <button
              onClick={() => setView('admin')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                view === 'admin' ? 'bg-white text-[#1E2D5A]' : 'bg-white/10 text-white/80'
              }`}
            >
              Admin Console
            </button>
          )}
        </div>
      </div>

      {/* 3. Right Content Region */}
      <div className="flex-1 flex flex-col overflow-hidden">
        
        {/* Right Header Panel */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 md:px-8 shadow-xs shrink-0 select-none">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-widest font-display">
            <span className="text-[#1E2D5A]">Active PRFs</span>
            <span className="text-gray-300">/</span>
            <span className="text-slate-400 font-medium font-sans">
              {view === 'dashboard' && 'Master Ledger'}
              {view === 'new-request' && 'New Request'}
              {view === 'edit-request' && 'Edit Form'}
              {view === 'detail' && 'PRF Ledger Detail'}
              {view === 'admin' && 'Admin Configuration'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            {view !== 'dashboard' && (
              <button
                onClick={() => { setView('dashboard'); setSelectedPrfId(null); }}
                className="text-xs font-bold text-[#1E2D5A] hover:text-[#28386a] border border-slate-200 hover:border-slate-300 bg-white px-3 py-1.8 rounded-lg transition select-none cursor-pointer"
              >
                ← Back to Dashboard
              </button>
            )}

            {/* The Top Right Logo / Link with Right-click back to default dashboard */}
            <a 
              href="https://stlaf-financial-portal.example.com"
              target="_blank"
              rel="noopener noreferrer"
              onContextMenu={(e) => {
                e.preventDefault();
                setView('dashboard');
                setSelectedPrfId(null);
              }}
              title="Left click: Open portal info | Right click: Go back to Dashboard"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition cursor-pointer select-none group"
            >
              <div className="w-7 h-7 bg-[#1E2D5A] rounded flex items-center justify-center shrink-0 group-hover:scale-105 transition shadow-sm">
                <div className="w-4 h-4 border-2 border-white rounded-xs"></div>
              </div>
              <div className="flex flex-col text-left shrink-0">
                <span className="text-[10px] font-black text-[#1E2D5A] tracking-wider leading-none">STLAF</span>
                <span className="text-[8px] text-slate-400 font-medium tracking-widest leading-none mt-0.5 uppercase">SYSTEMS</span>
              </div>
            </a>
          </div>
        </header>

        {/* Scaled App views container */}
        <div className="flex-1 overflow-y-auto">
          {view === 'dashboard' && (
            <DashboardView
              requests={prfRequests}
              onCreateNew={() => {
                setSelectedPrfId(null);
                setView('new-request');
              }}
              onSelect={(id) => {
                setSelectedPrfId(id);
                setView('detail');
              }}
              currentUser={currentUserProfile}
              allUsers={allUsersProfile}
              onImpersonate={impersonateUser}
              googleConfigured={googleConfigured}
              notifications={notifications.filter(n => n.userId === fbUser.uid)}
              onMarkNotificationRead={markNotificationRead}
            />
          )}

          {view === 'new-request' && (
            <PrfFormView
              onBack={() => setView('dashboard')}
              onSubmit={handlePrfSubmit}
              currentUser={currentUserProfile}
              nextPrfNumber={getNextPrfNumber()}
            />
          )}

          {view === 'edit-request' && (
            <PrfFormView
              existingPrf={prfRequests.find(r => r.id === selectedPrfId)}
              existingLineItems={lineItems.filter(li => li.prfRequestId === selectedPrfId)}
              onBack={() => setView('dashboard')}
              onSubmit={handlePrfSubmit}
              currentUser={currentUserProfile}
              nextPrfNumber={prfRequests.find(r => r.id === selectedPrfId)?.prfNumber || ''}
            />
          )}

          {view === 'detail' && selectedPrfId && (
            <PrfDetailView
              prf={prfRequests.find(r => r.id === selectedPrfId)!}
              lineItems={lineItems.filter(li => li.prfRequestId === selectedPrfId)}
              comments={comments.filter(c => c.prfRequestId === selectedPrfId)}
              auditLogs={auditLogs.filter(al => al.details.includes(prfRequests.find(r => r.id === selectedPrfId)?.prfNumber || '___'))}
              currentUser={currentUserProfile}
              onBack={() => {
                setSelectedPrfId(null);
                setView('dashboard');
              }}
              onTransition={async (act, sig, comment) => {
                await handleSyncTransition(selectedPrfId, act, sig, comment);
              }}
              onPostComment={handlePostComment}
            />
          )}

          {view === 'admin' && currentUserProfile?.role === 'Administrator' && (
            <AdminSettingsView
              onBack={() => setView('dashboard')}
              currentUser={currentUserProfile}
              allUsers={allUsersProfile}
              auditLogs={auditLogs}
              googleConfigured={googleConfigured}
              configKeys={configKeys}
              onRefreshConfig={checkDiagnostics}
              onPromoteUser={handlePromoteAdmin}
            />
          )}
        </div>
      </div>

    </div>
  );
}
