import { useState } from 'react';
import { PrfRequest, UserProfile, UserRole } from '../types';
import { FileText, Plus, Search, Filter, AlertTriangle, CheckCircle, Bell, ArrowRight, Layers, FileSpreadsheet } from 'lucide-react';

interface DashboardViewProps {
  requests: PrfRequest[];
  onCreateNew: () => void;
  onSelect: (id: string) => void;
  currentUser: UserProfile | null;
  allUsers: UserUserProfile[];
  onImpersonate: (uid: string) => void;
  googleConfigured: boolean | null;
  notifications: any[];
  onMarkNotificationRead: (id: string) => void;
}

interface UserUserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  signatureUrl: string | null;
}

export default function DashboardView({
  requests,
  onCreateNew,
  onSelect,
  currentUser,
  allUsers,
  onImpersonate,
  googleConfigured,
  notifications,
  onMarkNotificationRead
}: DashboardViewProps) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showNotificationsOnly, setShowNotificationsOnly] = useState(false);

  // Filter requests based on queries
  const filteredRequests = requests.filter((r) => {
    const rNo = r.prfNumber.toLowerCase();
    const client = r.clientName.toLowerCase();
    const dept = r.department.toLowerCase();
    const query = search.toLowerCase();
    const matchesSearch = rNo.includes(query) || client.includes(query) || dept.includes(query);

    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;

    // Permissions filtering logic
    let matchesPermissions = true;
    if (currentUser?.role === 'Requestor') {
      // Requestors can view all, but let's highlight their own or allow full dashboard for workflow overview
      // The prompt says "REQUESTOR: Create, edit own drafts, submit"
      // Wait, we can list all, but tag their own! This is fantastic.
    }

    return matchesSearch && matchesStatus && matchesPermissions;
  });

  // Calculate stats counts
  const stats = {
    Total: requests.length,
    Draft: requests.filter(r => r.status === 'Draft').length,
    'Pending Approval': requests.filter(r => r.status === 'Pending Approval').length,
    Approved: requests.filter(r => r.status === 'Approved').length,
    Received: requests.filter(r => r.status === 'Received').length,
    Completed: requests.filter(r => r.status === 'Completed').length,
    Rejected: requests.filter(r => r.status === 'Rejected').length,
  };

  const statConfig = [
    { label: 'Draft', count: stats.Draft, borderClass: 'border-l-4 border-gray-400 text-gray-700', tagline: 'Unsubmitted Work' },
    { label: 'Pending Approval', count: stats['Pending Approval'], borderClass: 'border-l-4 border-amber-400 text-amber-900', tagline: 'Requires Attention' },
    { label: 'Approved', count: stats.Approved, borderClass: 'border-l-4 border-emerald-500 text-emerald-900', tagline: 'Process Underway' },
    { label: 'Received', count: stats.Received, borderClass: 'border-l-4 border-blue-500 text-blue-900', tagline: 'Auditors Review' },
    { label: 'Completed', count: stats.Completed, borderClass: 'border-l-4 border-purple-500 text-[#1E293B]', tagline: 'Ledger Closed' },
    { label: 'Rejected', count: stats.Rejected, borderClass: 'border-l-4 border-red-500 text-red-900', tagline: 'Needs Modification' }
  ];

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto p-4 md:p-6 pb-24 font-sans text-slate-800">
      
      {/* 1. Google API Credentials Status Banner */}
      {googleConfigured === false && (
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-rose-200 bg-rose-50/80 text-rose-900 rounded-xl shadow-xs animate-fade-in">
          <div className="flex items-start gap-3">
            <span className="p-2 bg-rose-100 text-rose-700 rounded-lg shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </span>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider">Google Cloud Integrations Offline</h4>
              <p className="text-[11px] text-rose-800/80 mt-0.5 leading-relaxed">
                The credentials variables are missing from your <code>.env</code> file. Drive voucher copies, signature images uploads, and master spreadsheet ledgers updates will be simulated or fail until completed.
              </p>
            </div>
          </div>
          <div className="text-[10px] font-mono bg-white text-rose-700 font-bold px-3 py-1.5 border border-rose-200 rounded shadow-xs select-none uppercase shrink-0">
            VARIABLES CONFIG REQUIRED
          </div>
        </div>
      )}



      {/* 2. Impersonation Simulator Hub for seamless preview testing */}
      <div className="border border-indigo-150 bg-indigo-50/40 rounded-xl p-5 shadow-2xs">
        <div className="flex items-center gap-1.5 text-xs font-bold text-[#1E2D5A] tracking-wider uppercase mb-2">
          <Layers className="w-4 h-4 text-[#1E2D5A]" />
          INTEGRITY WORKFLOW TESTING & PREVIEW ROLE SWAPPER
        </div>
        <div className="text-[11px] text-slate-500 mb-3.5 leading-relaxed">
          Simulate the multi-role signature chain process. Select user profiles below to switch roles instantaneously between requestors, approvers, receivers, or administrators:
        </div>
        <div className="flex flex-wrap gap-2">
          {allUsers.map((u) => {
            const isSelected = currentUser?.uid === u.uid;
            return (
              <button
                key={u.uid}
                onClick={() => onImpersonate(u.uid)}
                className={`flex flex-col items-start px-3 py-2 text-xs border rounded-lg transition text-left shrink-0 font-sans cursor-pointer ${
                  isSelected
                    ? 'bg-[#1E2D5A] border-[#1E2D5A] text-white shadow-md scale-[1.02]'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className="font-bold text-[11px] truncate max-w-[130px]">{u.displayName}</span>
                <span className={`text-[9px] mt-0.5 font-bold px-1 py-0.2 rounded border uppercase font-mono tracking-wider ${
                  isSelected
                    ? 'bg-white/20 border-white/30 text-white'
                    : u.role === 'Administrator' ? 'bg-indigo-50 border-indigo-100 text-indigo-700' :
                      u.role === 'Approver' ? 'bg-amber-50 border-amber-100 text-amber-700' :
                      u.role === 'Receiver' ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-700'
                }`}>
                  {u.role}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Stat bento-grid cards matching Geometric Balance design */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statConfig.map((st) => (
          <button
            key={st.label}
            onClick={() => setStatusFilter(statusFilter === st.label ? 'all' : st.label)}
            className={`bg-white border-l-4 p-4 shadow-sm flex flex-col justify-between h-24 rounded-r-lg text-left transition select-none cursor-pointer ${st.borderClass} ${
              statusFilter === st.label ? 'ring-2 ring-indigo-600 ring-offset-2 scale-[1.02]' : 'hover:shadow-md'
            }`}
          >
            <div>
              <p className="text-[10px] uppercase font-extrabold text-[#1E293B]/60 tracking-wider font-sans">{st.label}</p>
              <h3 className="text-2xl font-black mt-1 text-[#1E293B] font-mono leading-none">{st.count}</h3>
            </div>
            <div className="text-[9px] text-[#1E2D5A] font-semibold tracking-wider uppercase truncate">{st.tagline}</div>
          </button>
        ))}
      </div>

      {/* 4. Filter controls, additions, and notifications */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 mt-2">
        
        {/* Search & filters */}
        <div className="flex flex-wrap items-center gap-3 shrink bg-white border border-slate-200 rounded-xl p-1.5 grow max-w-4xl shadow-2xs">
          <div className="flex items-center gap-2 px-2.5 text-slate-400 grow min-w-[200px]">
            <Search className="w-4 h-4" />
            <input
              type="text"
              placeholder="Search by PRF No, clientName, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-xs text-slate-800 focus:outline-hidden w-full placeholder:text-slate-400"
            />
          </div>
          
          <div className="h-4 w-[1px] bg-slate-200 hidden sm:block" />

          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.2 rounded-lg text-xs font-semibold cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-slate-100 text-slate-800'
                : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            All States
          </button>
        </div>

        {/* Create and Notifications Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowNotificationsOnly(!showNotificationsOnly)}
            className={`relative p-2.5 rounded-xl border cursor-pointer transition ${
              showNotificationsOnly
                ? 'bg-rose-50 border-rose-200 text-rose-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
            title="Notifications Drawer"
          >
            <Bell className="w-5 h-5" />
            {notifications.filter(n => !n.isRead).length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white font-black font-mono text-[9px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-bounce">
                {notifications.filter(n => !n.isRead).length}
              </span>
            )}
          </button>

          {currentUser?.role === 'Requestor' || currentUser?.role === 'Administrator' ? (
            <button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-4.5 py-2.5 bg-[#1E2D5A] text-white hover:bg-[#2e3e70] active:scale-95 transition rounded-xl text-xs font-bold font-sans shadow-md cursor-pointer"
            >
              <Plus className="w-4 h-4" /> New Payment Request (PRF)
            </button>
          ) : (
            <div className="text-xs text-slate-400 border border-slate-200 bg-slate-50 px-3 py-2 rounded-xl italic font-serif">
              Roles: View & Sign Only
            </div>
          )}
        </div>
      </div>

      {/* 5. Notifications Drawer Overlay */}
      {showNotificationsOnly && (
        <div className="border border-rose-100 bg-rose-50/50 rounded-xl p-4 shadow-xs flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-rose-900 uppercase tracking-widest flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-rose-600" />
              IN-APP ALERT DISPATCHES ({notifications.filter(n => !n.isRead).length} UNREAD)
            </h4>
            <button
              onClick={() => setShowNotificationsOnly(false)}
              className="text-[10px] font-bold text-rose-600 uppercase hover:underline cursor-pointer"
            >
              Hide Alerts
            </button>
          </div>
          {notifications.length === 0 ? (
            <p className="text-xs text-slate-400 italic py-2">No active notifications dispatched for your profile.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {notifications.map((n) => (
                <div key={n.id} className={`p-3 border rounded-lg bg-white shadow-3xs flex flex-col justify-between gap-2 text-xs hover:border-slate-350 transition relative ${n.isRead ? 'opacity-65' : 'border-rose-100'}`}>
                  <div>
                    <div className="font-bold text-slate-800">{n.title}</div>
                    <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">{n.message}</p>
                    <span className="text-[9px] text-slate-400 mt-1 block font-mono">
                      {new Date(n.createdAt).toLocaleDateString()}, {new Date(n.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1">
                    <button
                      onClick={() => onSelect(n.prfId)}
                      className="text-xs text-[#1E2D5A] hover:underline font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      View Request <ArrowRight className="w-3 h-3" />
                    </button>
                    {!n.isRead && (
                      <button
                        onClick={() => onMarkNotificationRead(n.id)}
                        className="text-[10px] text-rose-600 hover:text-rose-700 font-bold bg-rose-50/70 border border-rose-100 px-2 py-0.5 rounded cursor-pointer hover:bg-rose-100"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. Main Document Records list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden mt-2">
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 select-none">
          <div className="flex-1">
            <h2 className="font-bold text-gray-700 text-sm tracking-wide flex items-center gap-2">
              MASTER LEDGER SPREADSHEET 
              <span className="text-gray-400 font-mono text-xs font-normal italic">
                [GOOGLE_SHEETS_LEDGER_ID]
              </span>
            </h2>
            <p className="text-[10px] text-gray-400 font-medium">Showing {filteredRequests.length} active ledger records synchronized in Firestore</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            {statusFilter !== 'all' && (
              <div className="px-3 py-1 bg-white border border-gray-300 rounded text-[10px] font-bold cursor-pointer text-[#1E2D5A]" onClick={() => setStatusFilter('all')}>
                FILTER: <span className="underline">{statusFilter.toUpperCase()}</span> ✕
              </div>
            )}
            <div className="px-3 py-1 bg-white border border-gray-300 rounded text-[10px] font-bold select-none text-gray-500 uppercase">
              PERSISTENCE SNAPSHOT
            </div>
          </div>
        </div>        {filteredRequests.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 select-none">
            <FileText className="w-10 h-10 text-gray-200 mb-2" />
            <h4 className="text-xs font-bold text-slate-500 font-sans">No matching entries in this node</h4>
            <p className="text-[11px] text-slate-400 mt-1 max-w-xs leading-relaxed">No matching Payment Requests are persistent with the applied filters. Clean filters or create a new request.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[440px] overflow-y-auto relative border border-slate-100 rounded-lg">
            <table className="w-full border-collapse">
              <thead className="bg-white sticky top-0 z-10 shadow-xs">
                <tr className="border-b border-gray-100 select-none bg-gray-50/50">
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">PRF No.</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Date Requested</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Department</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Client / Entity</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Amount</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest">Spreadsheet Copy</th>
                  <th className="px-6 py-4 text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {filteredRequests.map((r) => {
                  let badgeStyle = 'bg-gray-100 text-gray-605';
                  if (r.status === 'Pending Approval') badgeStyle = 'bg-amber-100 text-amber-700';
                  if (r.status === 'Approved') badgeStyle = 'bg-green-100 text-green-700';
                  if (r.status === 'Received') badgeStyle = 'bg-blue-100 text-blue-700';
                  if (r.status === 'Completed') badgeStyle = 'bg-purple-100 text-purple-700';
                  if (r.status === 'Rejected') badgeStyle = 'bg-red-100 text-red-700';
 
                  const formattedAmt = '₱' + Number(r.totalAmount).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  });
 
                  return (
                    <tr key={r.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-[#1E2D5A]">{r.prfNumber}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{r.date}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{r.department}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-700">{r.clientName}</td>
                      <td className="px-6 py-4 text-xs font-mono font-bold text-gray-900">{formattedAmt}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded ${badgeStyle}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {r.spreadsheetUrl ? (
                          <a
                            href={r.spreadsheetUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] font-bold text-blue-600 underline"
                          >
                            VIEW DOC
                          </a>
                        ) : (
                          <span className="text-gray-400 font-mono text-[10px] tracking-wide select-none">UNLINKED</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                           onClick={() => onSelect(r.id)}
                           className="text-[10px] font-bold text-blue-600 underline cursor-pointer select-none"
                        >
                          VIEW DETAILS
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
