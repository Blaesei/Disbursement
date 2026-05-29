import React, { useState, useEffect } from 'react';
import { UserProfile, AuditLog, UserRole } from '../types';
import { ShieldCheck, Users, HelpCircle, HardDrive, Terminal, RefreshCw, KeyRound, Check, ArrowLeft, Key, Clipboard, Sparkles } from 'lucide-react';

interface AdminSettingsViewProps {
  onBack: () => void;
  currentUser: UserProfile | null;
  allUsers: UserUserProfile[];
  auditLogs: AuditLog[];
  googleConfigured: boolean | null;
  configKeys: any;
  onRefreshConfig: () => void;
  onPromoteUser: (targetUid: string, role: UserRole) => Promise<void>;
}

interface UserUserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  signatureUrl: string | null;
}

export default function AdminSettingsView({
  onBack,
  currentUser,
  allUsers,
  auditLogs,
  googleConfigured,
  configKeys,
  onRefreshConfig,
  onPromoteUser
}: AdminSettingsViewProps) {
  const [selectedUser, setSelectedUser] = useState('');
  const [targetRole, setTargetRole] = useState<UserRole>('Requestor');
  const [isPromoting, setIsPromoting] = useState(false);
  const [promoteStatus, setPromoteStatus] = useState<string | null>(null);

  // Google Authorization state
  const [customClientId, setCustomClientId] = useState('');
  const [customClientSecret, setCustomClientSecret] = useState('');
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handleGoogleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GOOGLE_OAUTH_SUCCESS') {
        const token = event.data.refreshToken;
        setGeneratedToken(token || 'Authorized successfully!');
        setAuthorizing(false);
        if (onRefreshConfig) {
          onRefreshConfig();
        }
      }
    };
    window.addEventListener('message', handleGoogleMessage);
    return () => window.removeEventListener('message', handleGoogleMessage);
  }, [onRefreshConfig]);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthorizing(true);
    setAuthError(null);
    setGeneratedToken(null);
    try {
      const q = new URLSearchParams();
      if (customClientId.trim()) q.append('clientId', customClientId.trim());
      if (customClientSecret.trim()) q.append('clientSecret', customClientSecret.trim());
      q.append('redirectUri', `${window.location.origin}/api/auth/google/callback`);
      
      const response = await fetch(`/api/auth/google/url?${q.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to generate Google Workspace authorization URL. Make sure server is running.');
      }
      const data = await response.json();
      
      const popup = window.open(data.url, 'google_oauth_popup', 'width=600,height=700');
      if (!popup) {
        throw new Error('Popup blocked! Please allow popups for this site to complete authorization.');
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Failed initiating authorization flow.');
      setAuthorizing(false);
    }
  };

  const handleCopy = () => {
    if (generatedToken) {
      navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    setIsPromoting(true);
    setPromoteStatus(null);
    try {
      await onPromoteUser(selectedUser, targetRole);
      setPromoteStatus(`Successfully promoted ${allUsers.find(u => u.uid === selectedUser)?.displayName} to ${targetRole}.`);
    } catch (err: any) {
      console.error(err);
      setPromoteStatus(`Error: ${err.message || 'Promotion failed.'}`);
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto p-4 md:p-6 pb-24 font-sans text-slate-800">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.8 bg-white border border-slate-200 hover:bg-slate-50 transition rounded-lg text-xs font-bold text-slate-600 shadow-3xs cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Return to Dashboard
        </button>
        <div>
          <h2 className="text-sm font-bold text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 justify-end">
            <ShieldCheck className="w-4 h-4 text-indigo-600" /> Administrative Security Console
          </h2>
          <p className="text-[10px] text-slate-400 mt-0.5 text-right font-mono">User: {currentUser?.displayName} ({currentUser?.role})</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Column 1: Promote Role Dashboard */}
        <div className="md:col-span-1 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-3xs flex flex-col gap-4">
            <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Users className="w-4 h-4 text-indigo-505" /> Promote Profiles
            </h4>
            
            <form onSubmit={handlePromote} className="flex flex-col gap-3.5 text-xs">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Select User Profile</label>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-2 w-full text-slate-700 focus:outline-[#1E2D5A]"
                  required
                >
                  <option value="">-- Choose User profile --</option>
                  {allUsers.map(u => (
                    <option key={u.uid} value={u.uid}>{u.displayName} ({u.role})</option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold text-slate-500">Assign Target Role</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value as UserRole)}
                  className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-2 w-full text-slate-700 focus:outline-[#1E2D5A]"
                >
                  <option value="Requestor">Requestor Workflow</option>
                  <option value="Approver">Finance Approver</option>
                  <option value="Receiver">Payment Receiver</option>
                  <option value="Administrator">Administrator console</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isPromoting || !selectedUser}
                className="w-full py-2 bg-[#1E2D5A] hover:bg-[#34467c] text-white font-bold rounded-lg transition disabled:opacity-50 cursor-pointer text-xs"
              >
                {isPromoting ? 'Promoting...' : 'Promote Status'}
              </button>
            </form>

            {promoteStatus && (
              <div className="p-2 bg-indigo-50 border border-indigo-100 rounded text-[11px] font-semibold text-indigo-900 leading-normal">
                {promoteStatus}
              </div>
            )}
          </div>
        </div>

        {/* Column 2: System Credentials integration details + NEW Google Auth Generator */}
        <div className="md:col-span-1 flex flex-col gap-4">
          
          {/* Server Diagnostics */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-3xs flex flex-col gap-3.5">
            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
              <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-indigo-505" /> Server Diagnostics
              </h4>
              <button
                onClick={onRefreshConfig}
                className="text-slate-500 hover:text-[#1E2D5A] p-1 rounded-md cursor-pointer hover:bg-slate-50 active:rotate-45 transition"
                title="Force refresh variables diagnostics"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-[11px]">
              
              <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <span className="font-semibold text-slate-600">Unified System Configuration</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase text-white ${googleConfigured ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  {googleConfigured ? 'CONNECTED' : 'MISSED'}
                </span>
              </div>

              <div className="flex flex-col gap-1.5 mt-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase select-none">Credentials checklist</span>
                {configKeys && Object.entries(configKeys).map(([envName, exists]) => (
                  <div key={envName} className="flex justify-between items-center p-1 px-2 border border-slate-100 rounded font-mono text-[10px]">
                    <span className="text-slate-500">{envName}</span>
                    <span className={`font-bold ${exists ? 'text-emerald-600' : 'text-rose-500'}`}>
                      {exists ? '✓ LOADED' : '✕ MISSING'}
                    </span>
                  </div>
                ))}
              </div>

            </div>
          </div>

          {/* New Google Workspace Refresh Token Generator */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-3xs flex flex-col gap-3.5">
            <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2">
              <Sparkles className="w-4 h-4 text-violet-500" /> Refresh Token Generator
            </h4>

            <p className="text-[11px] text-slate-500 leading-normal">
              If your Google integration has expired (GaxiosError <code>invalid_grant</code>), complete this authorization to regenerate a long-lived, stable refresh token.
            </p>

            <form onSubmit={handleAuthorize} className="flex flex-col gap-3 text-xs mt-1">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-bold text-slate-500">Google Client ID (Optional)</label>
                <input
                  type="text"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  placeholder="Defaults to server configuration"
                  className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-1.5 w-full font-mono text-slate-700 placeholder:font-sans focus:outline-[#1E2D5A]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] uppercase font-bold text-slate-500">Google Client Secret (Optional)</label>
                <input
                  type="password"
                  value={customClientSecret}
                  onChange={(e) => setCustomClientSecret(e.target.value)}
                  placeholder="Defaults to server configuration"
                  className="text-xs bg-slate-50 border border-slate-200 hover:border-slate-350 rounded-lg px-2.5 py-1.5 w-full font-mono text-slate-700 placeholder:font-sans focus:outline-[#1E2D5A]"
                />
              </div>

              <button
                type="submit"
                disabled={authorizing}
                className="w-full py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-bold rounded-lg transition disabled:opacity-50 cursor-pointer text-xs flex items-center justify-center gap-1.5 shadow-xs"
              >
                {authorizing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    <Key className="w-3.5 h-3.5" />
                    Authorize Google Workspace
                  </>
                )}
              </button>
            </form>

            {authError && (
              <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-lg text-[10px] font-semibold text-rose-800 leading-normal">
                {authError}
              </div>
            )}

            {generatedToken && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded-lg text-[11px] font-semibold text-emerald-900 leading-normal flex flex-col gap-1.5 animate-fade-in">
                <div className="flex justify-between items-center border-b border-emerald-150 pb-1">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Token Synced!</span>
                  <button
                    onClick={handleCopy}
                    className="text-emerald-700 hover:text-emerald-900 flex items-center gap-0.5 font-bold cursor-pointer text-[9px] uppercase font-sans"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Clipboard className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="font-mono text-[9px] break-all bg-emerald-100/30 p-1.5 rounded border border-emerald-200/50 max-h-[85px] overflow-y-auto">
                  {generatedToken}
                </div>
                <p className="text-[10px] text-emerald-700 mt-1">
                  Active refresh token has been securely cached in your database and is operational immediately! Note down and update your <strong>GOOGLE_REFRESH_TOKEN</strong> settings in Google AI Studio to keep it permanently synced.
                </p>
              </div>
            )}

          </div>

        </div>

        {/* Column 3: Live Audit log summary lists */}
        <div className="md:col-span-1 flex flex-col gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-3xs flex flex-col gap-3.5 max-h-[400px]">
            <h4 className="text-xs font-black text-[#1E2D5A] uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-100 pb-2 select-none">
              <Terminal className="w-4 h-4 text-slate-500" /> Flat audit logging records
            </h4>

            <div className="flex flex-col gap-3.5 overflow-y-auto pr-1 text-[11px]">
              {auditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-10 font-serif">No transactions recorded.</p>
              ) : (
                auditLogs.map(log => (
                  <div key={log.id} className="p-2 border border-slate-100 bg-slate-50/50 rounded-lg">
                    <div className="flex justify-between items-center mb-1 font-mono text-[9px] text-slate-400 select-none">
                      <span className="text-[#1E2D5A] font-bold uppercase">{log.action}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <span className="font-bold text-slate-700">{log.userName}</span>
                    <p className="text-slate-600 text-[10px] leading-relaxed mt-0.5 mt-1 font-mono">{log.details}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
