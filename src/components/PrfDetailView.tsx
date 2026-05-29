import React, { useState } from 'react';
import { PrfRequest, PrfLineItem, PrfComment, UserProfile, AuditLog } from '../types';
import { ChevronLeft, FileText, FileSpreadsheet, Download, ShieldCheck, HelpCircle, MessageSquare, History, Check, X, Send, Lock, Trash2 } from 'lucide-react';
import SignaturePad from './SignaturePad';

interface PrfDetailViewProps {
  prf: PrfRequest;
  lineItems: PrfLineItem[];
  comments: PrfComment[];
  auditLogs: AuditLog[];
  currentUser: UserProfile | null;
  onBack: () => void;
  onTransition: (action: 'submit' | 'approve' | 'reject' | 'receive' | 'complete', signatureDataUrl: string | null, commentContent?: string) => Promise<void>;
  onPostComment: (content: string) => Promise<void>;
  onDelete?: () => Promise<void>;
}

export default function PrfDetailView({
  prf,
  lineItems,
  comments,
  auditLogs,
  currentUser,
  onBack,
  onTransition,
  onPostComment,
  onDelete
}: PrfDetailViewProps) {
  const [commentContent, setCommentContent] = useState('');
  const [actionComment, setActionComment] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [isSignRequired, setIsSignRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const formattedTotal = '₱' + Number(prf.totalAmount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Calculate matching status colors
  let statusBadgeColor = 'bg-slate-50 border-slate-200 text-slate-500';
  if (prf.status === 'Pending Approval') statusBadgeColor = 'bg-amber-50 border-amber-200 text-amber-700 font-bold';
  if (prf.status === 'Approved') statusBadgeColor = 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold';
  if (prf.status === 'Received') statusBadgeColor = 'bg-blue-50 border-blue-200 text-blue-700 font-bold';
  if (prf.status === 'Completed') statusBadgeColor = 'bg-purple-50 border-purple-200 text-purple-700 font-bold';
  if (prf.status === 'Rejected') statusBadgeColor = 'bg-red-50 border-red-200 text-red-700 font-bold';

  const handleAction = async (action: 'submit' | 'approve' | 'reject' | 'receive' | 'complete') => {
    setErrorMessage(null);
    if ((action === 'approve' || action === 'receive') && !signatureData && !currentUser?.signatureUrl) {
      setErrorMessage(`Please draw and apply your signature on the pad before performing this sign-off.`);
      return;
    }
    if (action === 'reject' && !actionComment.trim()) {
      setErrorMessage('Please configure a rejection commentary detailing the changes required.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onTransition(action, signatureData, action === 'reject' ? actionComment : undefined);
      // Reset actions
      setActionComment('');
      setSignatureData(null);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Workflow transition failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitNormalComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentContent.trim()) return;
    try {
      await onPostComment(commentContent.trim());
      setCommentContent('');
    } catch (err) {
      console.error(err);
    }
  };

  // Determine authorized actions depend on user roles
  const canApprove = prf.status === 'Pending Approval' && (currentUser?.role === 'Approver' || currentUser?.role === 'Administrator');
  const canReceive = prf.status === 'Approved' && (currentUser?.role === 'Receiver' || currentUser?.role === 'Administrator');
  const canComplete = prf.status === 'Received' && (currentUser?.role === 'Receiver' || currentUser?.role === 'Administrator');
  const canSubmitDraft = (prf.status === 'Draft' || prf.status === 'Rejected') && (currentUser?.role === 'Requestor' || currentUser?.role === 'Administrator');
  const canDelete = onDelete && (currentUser?.role === 'Administrator' || (prf.requestorName === currentUser?.displayName && currentUser?.role === 'Requestor'));

  const showSignBox = (canApprove || canReceive || canSubmitDraft) && !currentUser?.signatureUrl;

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to delete PRF.');
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto p-4 md:p-6 pb-24 font-sans text-slate-800">
      
      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col scale-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-100 bg-rose-50/50 flex gap-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div className="flex flex-col pt-1">
                <h3 className="text-lg font-bold text-slate-900 leading-none mb-2">Delete Request</h3>
                <p className="text-sm text-slate-500 font-medium leading-relaxed">
                  Are you sure you want to delete this payment request ({prf.prfNumber})? This action cannot be undone and all associated documents and logs will be permanently removed.
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50/50 flex items-center justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:border-slate-300 rounded-xl transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 rounded-xl text-center shadow-xs transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between border-b border-slate-200 pb-4 gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.8 bg-white border border-slate-200 hover:bg-slate-50 transition rounded-lg text-xs font-bold text-slate-600 shadow-3xs cursor-pointer w-max"
        >
          <ChevronLeft className="w-4 h-4" /> Return to Dashboard
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`px-3 py-1 text-xs font-bold rounded-full border ${statusBadgeColor}`}>
            {prf.status.toUpperCase()}
          </span>
          {prf.pdfDriveUrl && (
            <a
              href={prf.pdfDriveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 shadow-3xs transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-rose-500" /> PDF Voucher
            </a>
          )}
          {prf.spreadsheetUrl && (
            <a
              href={prf.spreadsheetUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-semibold text-blue-800 shadow-3xs transition cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-blue-600" /> Google Doc Workspace
            </a>
          )}
          {prf.googleSheetId && (
            <button
              onClick={() => setIsPreviewOpen(!isPreviewOpen)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#1E2D5A]/20 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-xs font-bold text-[#1E2D5A] shadow-3xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> {isPreviewOpen ? 'Hide Preview' : 'Show Preview'}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setIsDeleteModalOpen(true)}
              className="inline-flex items-center gap-1 px-3 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg text-xs font-semibold text-rose-700 shadow-3xs transition cursor-pointer ml-1"
              title="Delete Payment Request"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 border border-rose-200 bg-rose-50 text-rose-900 text-xs rounded-xl font-semibold shadow-3xs">
          ✕ {errorMessage}
        </div>
      )}

      {/* 2. Structured Metadata Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Core details card */}
        <div className="md:col-span-3 border border-slate-200 bg-white rounded-2xl p-5 shadow-3xs flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <div>
              <h2 className="text-base font-bold text-[#1E2D5A] font-sans">{prf.prfNumber}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{prf.department} Unit</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block select-none">Total Voucher Value</span>
              <span className="text-xl font-black text-slate-900 font-mono mt-0.5 block">{formattedTotal}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div>
              <span className="text-slate-400 block font-medium select-none">Requestor</span>
              <span className="font-bold text-slate-800 mt-0.5 block truncate">{prf.requestorName}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium select-none">Target Client</span>
              <span className="font-bold text-slate-800 mt-0.5 block truncate">{prf.clientName}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium select-none">Bank Account</span>
              <span className="font-bold text-slate-800 mt-0.5 block truncate">{prf.bank}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium select-none">Billable Type</span>
              <span className="font-semibold text-slate-700 mt-0.5 block truncate">
                {prf.billable ? 'Bill to Client' : 'Internal cost'}
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic status guide */}
        <div className="border border-slate-200 bg-slate-50 rounded-2xl p-4 shadow-3xs flex flex-col justify-between">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-extrabold text-slate-400 font-sans block select-none">Current State Group</span>
            <div className="font-sans font-bold text-xs text-slate-700 mt-1 uppercase truncate">{prf.status}</div>
            <p className="text-[10px] text-slate-500 leading-normal mt-1.5 leading-relaxed">
              {prf.status === 'Draft' && 'Review details and line items, click Submit to alert Approvers.'}
              {prf.status === 'Pending Approval' && 'Finance Approver check required. Draw signature below to sign off.'}
              {prf.status === 'Approved' && 'Payment approved. Awaiting physical disbursement receipt from receiver.'}
              {prf.status === 'Received' && 'Transaction completed and acknowledged. Mark completed to lock record.'}
              {prf.status === 'Completed' && 'Voucher validated, locked, and recorded permanently to the master finance ledger.'}
              {prf.status === 'Rejected' && 'Drawn request rejected. Requestor can modify, re-draw lines and submit again.'}
            </p>
          </div>
          <span className="text-[9px] text-slate-400 font-serif inline-flex items-center gap-1 mt-2 shrink-0">
            <Lock className="w-2.5 h-2.5" /> Immutable after Complete
          </span>
        </div>
      </div>

      {/* 3. Action widgets inside the detail center */}
      {(canApprove || canReceive || canComplete || canSubmitDraft) && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
          <div className="flex items-center gap-2 border-b border-indigo-100 pb-2 text-xs font-bold text-indigo-950 uppercase select-none">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            Active Role Workflow Action Panel ({currentUser?.role} Mode)
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
            {/* Signature Draw */}
            {showSignBox ? (
              <div className="md:col-span-7 flex flex-col gap-2 w-full">
                <span className="text-xs font-black text-indigo-900 uppercase">1. DRAW YOUR VERIFICATION SIGNATURE</span>
                <SignaturePad onSave={(b64) => setSignatureData(b64)} disabled={isSubmitting} />
                {signatureData && (
                  <div className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 border border-emerald-100 px-2 py-1 rounded w-max mt-1">
                    ✓ Signature successfully drawn and locked.
                  </div>
                )}
              </div>
            ) : (
              <div className="md:col-span-7 p-4 border border-emerald-100 bg-emerald-50/50 text-emerald-950 rounded-xl text-xs font-medium h-max flex items-center gap-3">
                <span className="p-1 px-1.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">✓</span>
                <div>
                  <span className="font-bold">Authentic Profile Signature Ready:</span> Your user profile already stores an active signature. We will use it automatically without forcing re-draws.
                </div>
              </div>
            )}

            {/* Actions triggers */}
            <div className="md:col-span-5 flex flex-col gap-3.5 w-full">
              {canSubmitDraft && (
                <>
                  <span className="text-xs font-bold text-indigo-900 uppercase select-none">Action Controls</span>
                  <button
                    onClick={() => handleAction('submit')}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-[#1E2D5A] hover:bg-[#34487b] text-white rounded-xl text-xs font-extrabold shadow-md cursor-pointer disabled:opacity-50"
                  >
                    SUBMIT TO APPROVER
                  </button>
                </>
              )}

              {canApprove && (
                <>
                  <span className="text-xs font-bold text-indigo-900 uppercase select-none">Approve or Request changes</span>
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      placeholder="Add reason if rejecting request..."
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                      className="text-xs bg-white border border-slate-200 focus:outline-[#1E2D5A] rounded-lg px-3 py-2 text-slate-800"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleAction('approve')}
                      disabled={isSubmitting}
                      className="flex items-center justify-center gap-1 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer disabled:opacity-50"
                    >
                      <Check className="w-4 h-4" /> APPROVED
                    </button>
                    <button
                      onClick={() => handleAction('reject')}
                      disabled={isSubmitting || !actionComment.trim()}
                      className="flex items-center justify-center gap-1 px-3 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer disabled:opacity-50 disabled:bg-rose-450"
                    >
                      <X className="w-4 h-4" /> REJECTED
                    </button>
                  </div>
                </>
              )}

              {canReceive && (
                <>
                  <span className="text-xs font-bold text-indigo-900 uppercase select-none">Receipt action control</span>
                  <button
                    onClick={() => handleAction('receive')}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> CONFIRM RECEIPT SENT
                  </button>
                </>
              )}

              {canComplete && (
                <>
                  <span className="text-xs font-bold text-indigo-900 uppercase select-none">Ledger reconciliation locks</span>
                  <button
                    onClick={() => handleAction('complete')}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
                  >
                    <Check className="w-4 h-4" /> RECONCILE & COMPLETE VOUCHER
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Docs Document Preview (Matching User's Attached Screenshot) */}
      {isPreviewOpen && prf.googleSheetId && (
        <div className="flex flex-col gap-3 mt-1 select-none">
          <div className="text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest font-sans">
            GENERATED DOCUMENT PREVIEW
          </div>
          <div className="border border-slate-200 bg-slate-100 rounded-2xl p-4 md:p-6 shadow-xs flex justify-center w-full min-h-[500px]">
            <iframe
              src={`https://docs.google.com/document/d/${prf.googleSheetId}/preview`}
              className="w-full h-[650px] rounded-xl border border-slate-200 shadow-md bg-white overflow-hidden"
              title="Google Docs Document Preview Frame"
              allow="autoplay"
            />
          </div>
        </div>
      )}

      {/* 4. Column split layout for particulars list and signature box summaries */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left column: Line items particulars */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-150 bg-slate-50 text-xs font-black text-[#1E2D5A] uppercase tracking-wider select-none">
              Transaction Breakdown Table
            </div>
            <div className="overflow-x-auto text-xs">
              <table className="w-full text-left col-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-500 font-bold text-[10px] uppercase select-none">
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Detailed Description & Purpose of Transaction</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 text-xs">
                  {lineItems.map((li, idx) => (
                    <tr key={li.id || idx}>
                      <td className="px-4 py-2.5 font-mono text-slate-500">{li.date}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-700 leading-normal">{li.description}</td>
                      <td className="px-4 py-2.5 font-mono text-right font-bold text-slate-800">
                        ₱{Number(li.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs font-bold select-none">
              <span className="text-[#1E2D5A] uppercase font-bold text-[11px] tracking-wide">AGGREGATED TOTAL</span>
              <span className="text-slate-900 font-mono text-sm">{formattedTotal}</span>
            </div>
          </div>
        </div>

        {/* Right column: Signatures side box cards list */}
        <div className="flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-3xs flex flex-col gap-3.5">
            <span className="text-[10px] font-extrabold text-[#1E2D5A] uppercase tracking-widest select-none">OFFICIAL SIGN-OFF LEDGERS</span>
            
            <div className="flex flex-col gap-3 text-xs">
              
              {/* Stat 1: Requestor */}
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl relative overflow-hidden">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">1. REQUESTOR SIGN-OFF</span>
                <span className="font-bold text-slate-800 block truncate mt-0.5">{prf.requestorName}</span>
                <span className="text-[9px] text-slate-400 font-mono block mt-1">{prf.requestorSignedAt || 'Await Submission'}</span>
                {prf.requestorSignatureUrl ? (
                  <div className="mt-2 h-14 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-1 bg-white">
                    <img referrerPolicy="no-referrer" src={prf.requestorSignatureUrl} className="max-h-full max-w-full object-contain" alt="Requestor Signature" />
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic block mt-1.5 font-serif">Awaiting draw</span>
                )}
              </div>

              {/* Stat 2: Approver */}
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl relative overflow-hidden">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">2. APPROVER SIGN-OFF</span>
                <span className="font-bold text-slate-800 block truncate mt-0.5">{prf.approverName || '— Pending Approval —'}</span>
                <span className="text-[9px] text-slate-400 font-mono block mt-1">{prf.approverSignedAt || 'Await Verification'}</span>
                {prf.approverSignatureUrl ? (
                  <div className="mt-2 h-14 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-1 bg-white">
                    <img referrerPolicy="no-referrer" src={prf.approverSignatureUrl} className="max-h-full max-w-full object-contain" alt="Approver Signature" />
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic block mt-1.5 font-serif">Awaiting sign</span>
                )}
              </div>

              {/* Stat 3: Receiver */}
              <div className="p-3 bg-slate-50 border border-slate-150 rounded-xl relative overflow-hidden">
                <span className="text-[9px] font-bold text-slate-400 block uppercase">3. RECEIVER SIGN-OFF</span>
                <span className="font-bold text-slate-800 block truncate mt-0.5">{prf.receiverName || '— Pending Receipt —'}</span>
                <span className="text-[9px] text-slate-400 font-mono block mt-1">{prf.receiverSignedAt || 'Await Handover'}</span>
                {prf.receiverSignatureUrl ? (
                  <div className="mt-2 h-14 border border-dashed border-slate-200 rounded-lg flex items-center justify-center p-1 bg-white">
                    <img referrerPolicy="no-referrer" src={prf.receiverSignatureUrl} className="max-h-full max-w-full object-contain" alt="Receiver Signature" />
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-400 italic block mt-1.5 font-serif">Awaiting sign</span>
                )}
              </div>

            </div>
          </div>
        </div>

      </div>

      {/* 5. Discussion comments and security Audit Trails logs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Discussion comments feed */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs p-4 md:p-5 flex flex-col gap-4">
          <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <MessageSquare className="w-4 h-4 text-slate-500" />
            WORKFLOW DISCUSSION AND REMARKS ({comments.length})
          </h4>

          {/* New message input */}
          <form onSubmit={submitNormalComment} className="flex gap-2.5">
            <input
              type="text"
              placeholder="Post a query, review detail, or clarify remark..."
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 focus:outline-[#1E2D5A] rounded-xl px-3 py-2.5 grow"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#1E2D5A] hover:bg-[#32457c] text-white font-bold rounded-xl text-xs flex items-center justify-center transition shrink-0 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* feed messages list */}
          <div className="flex flex-col gap-3 max-h-56 overflow-y-auto pr-1">
            {comments.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6 font-serif select-none">No active discussion notes recorded for this request.</p>
            ) : (
              comments.map((cm) => (
                <div key={cm.id} className="p-3 border border-slate-100 bg-slate-50/50 rounded-xl leading-relaxed">
                  <div className="flex justify-between items-center text-[10px] mb-1 font-mono text-slate-400 select-none">
                    <span className="font-bold text-slate-700">
                      {cm.userName} ({cm.userRole})
                    </span>
                    <span>
                      {new Date(cm.createdAt).toLocaleDateString()}, {new Date(cm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-normal">{cm.content}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Security Audit records logs board */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-3xs p-4 md:p-5 flex flex-col gap-4">
          <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
            <History className="w-4 h-4 text-slate-500" />
            DOCUMENT AUDIT LOG TRAIL ({auditLogs.length} ENTRIES)
          </h4>

          <div className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1 text-[11px] font-sans">
            {auditLogs.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-6 font-serif">No security log actions recorded.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="p-2.5 border-b border-slate-100 last:border-none flex items-start gap-2 text-slate-600">
                  <span className="p-1 px-1.5 rounded-md font-mono font-bold bg-[#1E2D5A]/10 text-[#1E2D5A] uppercase tracking-wider text-[9px]">
                    {log.action}
                  </span>
                  <div className="grow">
                    <span className="font-bold text-slate-700 block text-[11px]">
                      {log.userName} ({log.userRole})
                    </span>
                    <p className="text-slate-500 mt-0.5 leading-relaxed font-mono text-[10px]">{log.details}</p>
                    <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                      {new Date(log.timestamp).toISOString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
