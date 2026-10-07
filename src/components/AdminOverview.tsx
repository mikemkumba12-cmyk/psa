import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ShieldCheck, ArrowUpRight, TrendingUp, DollarSign, Users, Clock, AlertCircle, ChevronRight, Activity, MessageSquare, Send, X, Loader2, CalendarClock } from 'lucide-react';
import { LoanApplication } from '../types';
import { platformApi } from '../lib/platformApi';
import { hasApiBackend } from '../lib/apiClient';
import { applicationsStore, repaymentsStore, customersStore, payrollStore } from '../lib/store';
import TopUpOpportunitiesCard from './TopUpOpportunitiesCard';

interface AdminOverviewProps {
  applications: LoanApplication[];
  onSelectApplication: (app: LoanApplication) => void;
  onNavigateToTab: (tab: string) => void;
  dashboardSummary?: {
    totalDisbursed: number;
    totalCollected: number;
    collectionRate: number;
    totalInterestEarned: number;
    pendingCount: number;
    activeCount: number;
    totalApplications: number;
    recentAuditActivity: any[];
  } | null;
}

export default function AdminOverview({ applications: applicationsProp, onSelectApplication, onNavigateToTab, dashboardSummary }: AdminOverviewProps) {
  const applications = Array.isArray(applicationsProp) ? applicationsProp : [];
  const pendingApps = applications.filter(app => app.status === 'Under Review' || app.status === 'Reviewing' || app.status === 'In Progress');

  // Fix 5: Compute live fallback KPIs from store when backend is absent
  const liveKPIs = useMemo(() => {
    const allApps = applicationsStore.getAllUnfiltered();
    const allReps = repaymentsStore.getAllUnfiltered();
    const disbursedApps = allApps.filter(a => ['Disbursed', 'Approved', 'Active', 'Completed'].includes(a.status));
    const totalDisbursed = disbursedApps.reduce((s, a) => s + (a.amount || 0), 0);
    const paidReps  = allReps.filter(r => r.status === 'Paid');
    const totalDue  = allReps.filter(r => ['Paid', 'Overdue', 'FAILED_DEDUCTION'].includes(r.status)).length;
    const collectionRate = totalDue > 0 ? (paidReps.length / totalDue) * 100 : 0;
    const activeCount = allApps.filter(a => a.status === 'Disbursed').length;
    return { totalDisbursed, collectionRate: Math.round(collectionRate * 100) / 100, activeCount };
  }, []);

  // Fix 6: Days in queue helper
  const daysInQueue = (dateStr: string): number => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 0;
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  };
  const queueAgeBadge = (days: number) => {
    if (days <= 2) return { label: `${days}d`, cls: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20' };
    if (days <= 5) return { label: `${days}d`, cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20' };
    return { label: `${days}d ⚠`, cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20' };
  };

  // Messaging states
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const pollingRef = useRef<any>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const formatMWK = (val: number) => {
    return 'K ' + val.toLocaleString();
  };

  const loadConversations = async () => {
    if (!hasApiBackend()) return;
    try {
      const list = await platformApi.getConversations();
      if (list) setConversations(list);
    } catch (err) {
      console.warn("Failed to load staff-side conversations:", err);
    }
  };

  const loadMessages = async (convId: string) => {
    if (!hasApiBackend()) return;
    try {
      const msgs = await platformApi.getMessages(convId);
      if (msgs) setChatMessages(msgs);
    } catch (err) {
      console.warn("Failed to load messages:", err);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 12000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedChat) {
      void platformApi.markRead(selectedChat.id);
      loadMessages(selectedChat.id);
      pollingRef.current = setInterval(() => loadMessages(selectedChat.id), 4000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [selectedChat?.id]);

  const handleSend = async () => {
    if (!chatText.trim() || !selectedChat) return;
    const text = chatText.trim();
    setChatText('');
    setSending(true);
    try {
      await platformApi.sendMessage(selectedChat.id, text);
      await loadMessages(selectedChat.id);
      loadConversations();
      setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (err) {
      console.warn(err);
      setChatText(text);
    } finally {
      setSending(false);
    }
  };

  const recentAudit = dashboardSummary?.recentAuditActivity || [];

  return (
    <div className="space-y-6">
      {/* Top Welcome Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Pinnacle Credit Operations</h1>
          <p className="text-sm text-secondary">Good morning. Your team has <strong>{pendingApps.length} pending</strong> assessments today.</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-2 flex items-center gap-2 text-xs font-semibold dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span>Demo Environment (PINACO)</span>
        </div>
      </div>

      {/* Bento Grid Metrics */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Disbursements YTD</span>
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-on-surface">
              {dashboardSummary
                ? formatMWK(dashboardSummary.totalDisbursed)
                : liveKPIs.totalDisbursed > 0
                  ? formatMWK(liveKPIs.totalDisbursed)
                  : <span className="text-base text-secondary">No portfolio data available</span>
              }
            </p>
            <p className="text-[10px] text-green-600 font-bold mt-1 flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" /> +14.2% from last quarter
            </p>
          </div>
        </div>

        <div className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Collection Rate</span>
            <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-on-surface">
              {dashboardSummary
                ? `${dashboardSummary.collectionRate}%`
                : liveKPIs.collectionRate > 0
                  ? `${liveKPIs.collectionRate.toFixed(2)}%`
                  : <span className="text-base text-secondary">No data</span>
              }
            </p>
            <p className="text-[10px] text-secondary font-semibold mt-1">Goal: 98.00% minimum</p>
          </div>
        </div>

        <div className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Active Accounts</span>
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-on-surface">
              {dashboardSummary
                ? `${dashboardSummary.activeCount} Loans`
                : liveKPIs.activeCount > 0
                  ? `${liveKPIs.activeCount} Active`
                  : <span className="text-base text-secondary">No data</span>
              }
            </p>
            <p className="text-[10px] text-secondary font-semibold mt-1">Live from database</p>
          </div>
        </div>

        <div className="bg-white border border-outline-variant p-5 rounded-2xl shadow-sm space-y-4">
          <div className="flex justify-between items-start">
            <span className="text-[10px] font-bold text-secondary uppercase tracking-widest">Decision Queue</span>
            <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600">
              <Clock className="w-4 h-4 animate-pulse" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-error">{pendingApps.length} Applications</p>
            <p className="text-[10px] text-secondary font-semibold mt-1">Avg response: 1.8 hours</p>
          </div>
        </div>
      </section>

      {/* Main Grid: Pending Queue & Staff Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Pending Queue Table Block */}
          <section className="bg-white border border-outline-variant rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <div>
                <h2 className="text-base font-bold text-on-surface">Active Assessment Queue</h2>
                <p className="text-xs text-secondary mt-0.5">Priority scoring and credit assessments pending</p>
              </div>
              <button 
                onClick={() => onNavigateToTab('customers')}
                className="text-xs font-bold text-primary flex items-center gap-0.5 hover:underline"
              >
                All Clients <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-surface-container/50 border-b border-surface-container text-secondary font-bold uppercase tracking-wider">
                    <th className="p-4 font-semibold">Applicant</th>
                    <th className="p-4 font-semibold">Business/Sector</th>
                    <th className="p-4 font-semibold">Requested</th>
                    <th className="p-4 font-semibold">Score</th>
                    <th className="p-4 font-semibold">In Queue</th>
                    <th className="p-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container">
                  {pendingApps.length > 0 ? (
                    pendingApps.map((app) => (
                      <tr key={app.id} className="hover:bg-surface-container-low transition-colors group">
                        <td className="p-4">
                          <div className="font-bold text-on-surface">{app.applicantName}</div>
                          <div className="text-[10px] text-secondary font-mono">ID: {app.id}</div>
                        </td>
                        <td className="p-4">
                          <div className="font-semibold text-on-surface">{app.businessName || 'Personal'}</div>
                          <div className="text-[10px] text-secondary">{app.sector}</div>
                        </td>
                        <td className="p-4 font-bold text-primary">
                          K {app.amount.toLocaleString()}
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${
                              app.score >= 80 ? 'bg-green-500' : app.score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}></span>
                            <span className="font-bold">{app.score}</span>
                          </div>
                        </td>
                        {/* Fix 6: Days in Queue */}
                        <td className="p-4">
                          {(() => {
                            const days = daysInQueue(app.date);
                            const badge = queueAgeBadge(days);
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                                <CalendarClock className="w-3 h-3" />{badge.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="p-4">
                          <button 
                            onClick={() => onSelectApplication(app)}
                            className="bg-primary text-white text-[11px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform hover:brightness-105 flex items-center gap-0.5"
                          >
                            Review <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-secondary">
                        No active assessments in queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Repeat Borrower Top-up Opportunities (Phase 3 Feature) */}
          <TopUpOpportunitiesCard
            customers={customersStore.getAll()}
            applications={applications}
            repayments={repaymentsStore.getAllUnfiltered()}
            payrollRecords={payrollStore.getAllRecords()}
            onSelectCustomer={() => onNavigateToTab('customers')}
          />

          {/* Client Conversations Live Feed (NEW Area 2 feature) */}
          {hasApiBackend() && (
            <section className="bg-white border border-outline-variant rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-on-surface">Active Client Support Threads</h2>
                <p className="text-xs text-secondary mt-0.5">Real-time chat advisory lines to registered clients</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {conversations.length > 0 ? (
                  conversations.map((c: any) => {
                    const unread = Number(c.unread_count || 0);
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => setSelectedChat({
                          id: c.id,
                          name: 'Client Account', // Default representation
                          unreadCount: unread,
                        })}
                        className={`p-4 border rounded-xl hover:bg-gray-50 cursor-pointer transition-colors flex items-center justify-between ${
                          unread > 0 ? 'border-primary bg-primary/5' : 'border-outline-variant/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
                            C
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-on-surface">Client Conversation</h4>
                            <p className="text-[10px] text-secondary truncate max-w-[150px]">{c.last_msg?.content || 'No messages'}</p>
                          </div>
                        </div>
                        {unread > 0 && (
                          <span className="bg-primary text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                            {unread}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-2 text-center py-6 text-xs text-secondary flex flex-col items-center gap-1.5 border border-dashed border-outline-variant/50 rounded-xl">
                    <MessageSquare className="w-8 h-8 text-gray-300" />
                    No active chat threads currently open.
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Staff Activities & Alerts Timeline */}
        <section className="bg-white border border-outline-variant rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-on-surface">Staff Operations Activity</h2>
          
          <div className="space-y-4 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container max-h-[300px] overflow-y-auto pr-1">
            {recentAudit.length > 0 ? (
              recentAudit.map((log: any) => (
                <div key={log.id} className="flex gap-4 relative">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 z-10 border-2 border-white shadow-sm text-[10px] font-black text-white ${
                    log.actorRole === 'client' ? 'bg-orange-500' : log.actorRole === 'staff' ? 'bg-blue-600' : 'bg-gray-500'
                  }`}>
                    {log.actorName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-on-surface leading-tight">{log.summary}</p>
                    <p className="text-[9px] text-secondary mt-0.5">
                      {log.action} • {new Date(log.occurredAt || log.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-secondary flex flex-col items-center gap-2">
                <Activity className="w-8 h-8 text-gray-300" />
                No operational log feed available.
              </div>
            )}
          </div>

          <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30 flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-[11px] text-on-surface leading-normal">
              <strong>System Notice:</strong> Bi-annual audit logs will be locked automatically on October 31.
            </p>
          </div>
        </section>
      </div>

      {/* CHAT MODAL FOR STAFF (NEW) */}
      {selectedChat && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col h-[500px]">
            {/* Modal Header */}
            <div className="p-4 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">C</div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">Client Support Line</h3>
                  <p className="text-[10px] text-secondary font-mono">{selectedChat.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedChat(null)}
                className="p-1.5 hover:bg-surface-container rounded-lg text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Messages list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-container-low">
              {chatMessages.map((msg: any) => {
                const isMe = msg.sender_id === 'staff-001';
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-xs ${
                      isMe ? 'bg-primary text-white rounded-tr-none' : 'bg-white border border-outline-variant/30 text-on-surface rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[9px] text-secondary mt-1 px-1">
                      {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
              <div ref={messageEndRef} />
            </div>

            {/* Input Footer */}
            <div className="p-3 border-t border-surface-container flex items-center gap-2 bg-white">
              <input 
                type="text" 
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Reply to client..."
                className="flex-1 text-xs border border-outline-variant/50 rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button 
                onClick={handleSend}
                disabled={sending}
                className="bg-primary text-white p-3 rounded-xl hover:brightness-105 disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
