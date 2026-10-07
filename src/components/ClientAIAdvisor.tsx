import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Brain, Send, Loader2, TrendingUp, ShieldCheck, DollarSign,
  Briefcase, Sparkles, RefreshCw, ChevronRight, MessageSquare,
  AlertCircle, ArrowLeft,
} from 'lucide-react';
import { applicationsStore, repaymentsStore } from '../lib/store';
import { useAuth } from '../auth/AuthContext';
import { computeHealthScore, runExpertSystem } from '../lib/intelligenceEngine';
import { isAdvisorConfigured, sendAdvisorMessage } from '../lib/aiAdvisorService';
import { AI_TRANSPARENCY } from '../lib/aiTransparency';
import { recordAuditEvent } from '../lib/auditTrail';
import type { AIChatMessage } from '../types';

// ── Sub-score bar ─────────────────────────────────────────────────────────────
function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">{label}</span>
        <span className="text-[11px] font-black" style={{ color }}>{value}/100</span>
      </div>
      <div className="h-1.5 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Animated score gauge ──────────────────────────────────────────────────────
function ScoreGauge({ score, color, tier }: { score: number; color: string; tier: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36 flex items-center justify-center">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r={radius} stroke="#f1f5f9" strokeWidth="10" fill="transparent" className="dark:stroke-white/10" />
          <circle
            cx="60" cy="60" r={radius}
            stroke={color}
            strokeWidth="10" fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 1s ease-in-out' }}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-4xl font-black text-gray-900 dark:text-white leading-none">{score}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">/100</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-bold" style={{ color }}>{tier}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">Financial Health Score</span>
    </div>
  );
}

// ── Chat bubble ───────────────────────────────────────────────────────────────
function ChatBubble({ msg }: { msg: AIChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0 mt-0.5 shadow-md shadow-purple-500/20">
          <Brain className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed ${
        isUser
          ? 'bg-gradient-to-br from-orange-500 to-amber-500 text-white rounded-tr-sm shadow-md shadow-orange-500/20'
          : 'bg-white dark:bg-white/10 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-white/10 rounded-tl-sm shadow-sm'
      }`}>
        {msg.content}
      </div>
    </div>
  );
}

export default function ClientAIAdvisor({ onBack }: { onBack: () => void }) {
  const { session } = useAuth();
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatStarted, setChatStarted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const advisorConfigured = isAdvisorConfigured();

  const applications = useMemo(() => applicationsStore.getAll(), []);
  const repayments = useMemo(() => repaymentsStore.getAll(), []);
  const paidCount = repayments.filter(r => r.status === 'Paid').length;

  // Use first application as profile for this demo
  const myApp = applications[0];
  const health = useMemo(() => myApp ? computeHealthScore(myApp) : null, [myApp]);
  const expert = useMemo(() => myApp ? runExpertSystem(myApp) : null, [myApp]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build system context for Gemini
  const systemContext = useMemo(() => {
    if (!health || !expert || !myApp) return '';
    return `You are Pinnacle AI, a financial guidance assistant for Pinnacle Financial Intelligence Platform, a Malawian microfinance and SME lending institution.

You are speaking with a customer named ${session?.fullName || 'the customer'}.

Transparency requirements:
- The Financial Health Score and Expert System Verdict are rules-based estimates from configured criteria, not trained-credit-model predictions.
- Never present an expert verdict as a final approval or decline.
- Tell the customer that officer review and verified documents are required for lending decisions.

Their financial profile:
- Business: ${myApp.businessName} (${myApp.sector} sector)
- Credit Score: ${myApp.score}/100
- Financial Health Score: ${health.composite}/100 (${health.tier})
- Repayment History: ${myApp.repaymentHistory}
- Debt-to-Income Ratio: ${myApp.debtToIncome}
- Monthly Revenue: MWK ${myApp.monthlyRevenue.toLocaleString()}
- Years in Business: ${myApp.yearsInBusiness}
- Active Loan Amount: MWK ${myApp.amount.toLocaleString()}
- Repayments Made: ${paidCount} on time
- Expert System Verdict: ${expert.verdict} (${expert.confidence}% confidence)
- Customer Segment: ${expert.segment}

Sub-scores:
- Repayment Score: ${health.repaymentScore}/100
- Income Stability: ${health.incomeStabilityScore}/100
- Debt Score: ${health.debtScore}/100
- Business Score: ${health.businessScore}/100

Expert Recommendation: ${expert.explanation}

Your role:
1. Give personalised, actionable financial advice based on the above profile.
2. Answer questions about their loan, repayments, eligibility, and financial improvement.
3. Use Malawian context (MWK currency, local business sectors like agriculture, retail, logistics).
4. Be warm, clear, and professional. Use plain language. Avoid jargon.
5. If they ask about loan increases, reference the expert verdict above.
6. Keep responses concise (2–4 sentences typically). Use bullet points for lists.
7. Never invent data not given above. If you don't know something, say so.
8. Include the rules-based/non-final-decision limitation when discussing scores, verdicts, or eligibility.`;
  }, [health, expert, myApp, session, paidCount]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: AIChatMessage = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setChatStarted(true);

    try {
      const responseText = await sendAdvisorMessage({
        message: text,
        systemContext,
        history: messages,
        customerId: session?.userId,
        applicationId: myApp?.id,
      });
      const aiMsg: AIChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, aiMsg]);
      recordAuditEvent({
        actorId: session?.userId || 'client-local',
        actorName: session?.fullName || 'Client User',
        actorRole: 'client',
        action: 'ai.advisor_message',
        entityType: 'ai_chat',
        entityId: myApp?.id,
        outcome: 'success',
        summary: 'Client used the AI financial advisor.',
        metadata: { applicationId: myApp?.id, promptLength: text.length },
      });
    } catch (err: any) {
      recordAuditEvent({
        actorId: session?.userId || 'client-local',
        actorName: session?.fullName || 'Client User',
        actorRole: 'client',
        action: 'ai.advisor_message_failed',
        entityType: 'ai_chat',
        entityId: myApp?.id,
        outcome: 'failure',
        summary: 'AI financial advisor failed to generate a response.',
        metadata: { applicationId: myApp?.id, error: err?.message || 'Unknown error' },
      });
      const errMsg: AIChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `I'm having trouble connecting right now. Please check your internet connection and try again. (${err?.message || 'Unknown error'})`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const quickPrompts = [
    'What is my Financial Health Score?',
    'Am I eligible for a loan increase?',
    'How can I improve my credit score?',
    'What are my repayment options?',
  ];

  if (!health || !expert) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-400 dark:text-gray-500 text-sm">No financial profile found. Apply for a loan first.</p>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 text-gray-500 dark:text-gray-400 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-md shadow-purple-500/30">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900 dark:text-white leading-none">AI Financial Advisor</h1>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold">Gemini chat over rules-based profile guidance</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/20 dark:bg-amber-500/10">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600" />
        <p className="text-[10px] font-semibold leading-relaxed text-amber-800 dark:text-amber-300">
          <span className="font-black">{AI_TRANSPARENCY.label}.</span> {AI_TRANSPARENCY.advisorDisclaimer}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

        {/* LEFT: Health Score Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* Score Card */}
          <div className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-violet-600" />
              <h2 className="text-xs font-bold text-gray-900 dark:text-white uppercase tracking-widest">Your Financial Health</h2>
            </div>

            <ScoreGauge score={health.composite} color={health.tierColor} tier={health.tier} />

            <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-[10px] font-semibold leading-relaxed text-gray-500 dark:bg-white/5 dark:text-gray-400">
              {AI_TRANSPARENCY.dataBasis}
            </p>

            <div className="mt-5 space-y-3">
              <ScoreBar label="Repayment History" value={health.repaymentScore}
                color={health.repaymentScore >= 80 ? '#16a34a' : health.repaymentScore >= 60 ? '#d97706' : '#dc2626'} />
              <ScoreBar label="Income Stability" value={health.incomeStabilityScore}
                color={health.incomeStabilityScore >= 80 ? '#16a34a' : health.incomeStabilityScore >= 60 ? '#d97706' : '#dc2626'} />
              <ScoreBar label="Debt Level" value={health.debtScore}
                color={health.debtScore >= 80 ? '#16a34a' : health.debtScore >= 60 ? '#d97706' : '#dc2626'} />
              <ScoreBar label="Business Performance" value={health.businessScore}
                color={health.businessScore >= 80 ? '#16a34a' : health.businessScore >= 60 ? '#d97706' : '#dc2626'} />
            </div>
          </div>

          {/* Expert Verdict */}
          <div className={`rounded-2xl p-4 border shadow-sm ${
            expert.verdict === 'Approve'
              ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/20'
              : expert.verdict === 'Decline'
              ? 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'
              : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className={`w-4 h-4 ${
                expert.verdict === 'Approve' ? 'text-green-600' :
                expert.verdict === 'Decline' ? 'text-red-600' : 'text-amber-600'
              }`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-700 dark:text-gray-300">Rules-Based Verdict</span>
            </div>
            <p className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-2">{expert.primaryReason}</p>
            {expert.suggestedAmount && (
              <div className="flex items-center gap-1.5 mt-2">
                <TrendingUp className="w-3.5 h-3.5 text-green-600" />
                <span className="text-[11px] font-bold text-green-700 dark:text-green-400">
                  Recommended: MWK {expert.suggestedAmount.toLocaleString()}
                </span>
              </div>
            )}
            <div className="mt-2 h-1 bg-white/40 dark:bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-current opacity-60"
                style={{ width: `${expert.confidence}%` }}
              />
            </div>
            <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">{expert.confidence}% {AI_TRANSPARENCY.confidenceLabel.toLowerCase()}</p>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Customer Tier', value: expert.segment, Icon: Briefcase, color: 'text-blue-600' },
              { label: 'Repayments Made', value: `${paidCount} on time`, Icon: DollarSign, color: 'text-green-600' },
            ].map(({ label, value, Icon, color }) => (
              <div key={label} className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-xl p-3 shadow-sm">
                <Icon className={`w-4 h-4 ${color} mb-1.5`} />
                <p className="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
                <p className="text-[9px] text-gray-400 dark:text-gray-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Chat Interface */}
        <div className="lg:col-span-3 bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm flex flex-col overflow-hidden" style={{ minHeight: '520px' }}>

          {/* Chat header */}
          <div className="px-4 py-3.5 border-b border-gray-100 dark:border-white/10 flex items-center gap-2 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-500/5 dark:to-purple-500/5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-gray-800 dark:text-white">Advisor Guidance Active</span>
            <button
              onClick={() => { setMessages([]); setChatStarted(false); }}
              className="ml-auto p-1.5 rounded-lg hover:bg-white/60 dark:hover:bg-white/10 text-gray-400 transition-colors"
              title="Clear chat"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {!chatStarted && (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center mx-auto mb-3 shadow-xl shadow-purple-500/30">
                    <Brain className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-base font-black text-gray-900 dark:text-white">Hello, {session?.fullName?.split(' ')[0] || 'there'}!</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                    I can explain your rules-based health score, loan profile, and ways to prepare for officer review.
                  </p>
                </div>

                <div>
                  <p className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 text-center">Quick Questions</p>
                  <div className="grid grid-cols-1 gap-2">
                    {quickPrompts.map(prompt => (
                      <button
                        key={prompt}
                        onClick={() => sendMessage(prompt)}
                        className="text-left px-3.5 py-2.5 bg-gray-50 dark:bg-white/5 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-gray-100 dark:border-white/10 hover:border-violet-200 dark:hover:border-violet-500/20 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-300 hover:text-violet-700 dark:hover:text-violet-300 transition-all flex items-center justify-between group"
                      >
                        {prompt}
                        <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-violet-400 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {messages.map(msg => <ChatBubble key={msg.id} msg={msg} />)}

            {isLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="px-3.5 py-2.5 bg-white dark:bg-white/10 border border-gray-100 dark:border-white/10 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin" />
                  <span className="text-xs text-gray-400 dark:text-gray-500">Analysing your profile…</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 py-3 border-t border-gray-100 dark:border-white/10">
            {!advisorConfigured && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                  Set VITE_API_BASE_URL for backend AI, or VITE_GEMINI_API_KEY for local prototype chat.
                </p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <textarea
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about your finances, loans, or health score…"
                className="flex-1 resize-none bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-300 dark:focus:border-violet-500/40 transition-all"
                style={{ maxHeight: 80 }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center text-white shadow-md shadow-purple-500/20 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[9px] text-gray-300 dark:text-gray-600 mt-1.5 text-center">
              Gemini-assisted guidance over rules-based scores · Not a loan approval
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
