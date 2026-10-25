import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, Send } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Feedback';
import { Card, PageHeader } from '../../ui/Layout';

interface Reply {
  answer: string;
  intent: string;
  sources: Array<{ title: string; reference: string | null }>;
  grounded: boolean;
  suggestions?: string[];
  handoff?: boolean;
  disclaimer: string;
}

interface Turn { role: 'user' | 'assistant'; text: string; reply?: Reply }

/** Renders **bold** and line breaks only — the assistant never returns HTML. */
function Formatted({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => (
        <p key={lineIndex} className={lineIndex ? 'mt-1.5' : ''}>
          {line.split(/(\*\*[^*]+\*\*)/).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <React.Fragment key={index}>{part}</React.Fragment>)}
        </p>
      ))}
    </>
  );
}

export function AssistantPage() {
  const { isStaff } = useAuth();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [turns]);

  const ask = async (question: string) => {
    if (!question.trim() || pending) return;
    setTurns(current => [...current, { role: 'user', text: question }]);
    setText('');
    setPending(true);
    setError(null);
    try {
      const reply = await api<Reply>('/api/assistant/chat', { body: { message: question } });
      setTurns(current => [...current, { role: 'assistant', text: reply.answer, reply }]);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The assistant is unavailable.');
    } finally {
      setPending(false);
    }
  };

  const starters = isStaff
    ? ['What documents are needed for SME finance?', 'Which products are available?', 'How is affordability checked?']
    : ['What loans are available?', 'What is the status of my application?', 'What documents do I need for SME finance?', 'How much would I pay for a payroll loan of 500,000 over 12 months?'];

  return (
    <>
      <PageHeader title="Assistant" description="Answers from Pinnacle’s approved product settings, policies and your own account. It can’t make or change decisions." />
      <Card>
        <div className="min-h-[40dvh] space-y-4">
          {turns.length === 0 && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-sm text-ink-muted">
                <Bot className="h-6 w-6 shrink-0 text-brand-700" aria-hidden />
                <p>Ask about loan products, required documents, membership, or {isStaff ? 'institution policy' : 'your applications and repayments'}. If I don’t have approved information, I’ll say so rather than guess.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {starters.map(starter => <Button key={starter} size="sm" variant="secondary" onClick={() => ask(starter)}>{starter}</Button>)}
              </div>
            </div>
          )}
          {turns.map((turn, index) => (
            <div key={index} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm sm:max-w-[80%] ${turn.role === 'user' ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink'}`}>
                <div className="break-words"><Formatted text={turn.text} /></div>
                {turn.reply && (
                  <div className="mt-2 space-y-1 border-t border-line pt-2 text-xs text-ink-muted">
                    {turn.reply.sources.length > 0 && (
                      <p>Source: {turn.reply.sources.map((source, sourceIndex) => (
                        <React.Fragment key={source.title}>{sourceIndex ? ', ' : ''}{source.reference ? <a className="underline" href={source.reference} target="_blank" rel="noreferrer">{source.title}</a> : source.title}</React.Fragment>
                      ))}</p>
                    )}
                    {turn.reply.handoff && !isStaff && <p><Link className="font-semibold text-brand-700 underline" to="/client/messages">Message a loan officer</Link></p>}
                    {turn.reply.suggestions && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {turn.reply.suggestions.map(suggestion => <button key={suggestion} type="button" className="rounded-full border border-line-strong bg-surface px-2 py-0.5 text-ink hover:bg-surface-muted" onClick={() => ask(suggestion)}>{suggestion}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {pending && <p className="text-sm text-ink-muted" role="status">Looking that up…</p>}
          <div ref={end} />
        </div>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <form onSubmit={event => { event.preventDefault(); void ask(text); }} className="mt-4 flex gap-2 border-t border-line pt-4">
          <label htmlFor="assistant-input" className="sr-only">Your question</label>
          <input id="assistant-input" value={text} onChange={event => setText(event.target.value)} maxLength={1000} placeholder="Type your question…"
            className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong px-3 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200" />
          <Button type="submit" size="lg" disabled={!text.trim()} loading={pending} icon={<Send className="h-4 w-4" />} aria-label="Ask"><span className="hidden sm:inline">Ask</span></Button>
        </form>
        <p className="mt-2 text-xs text-ink-subtle">Automated guidance from approved information. It is not a loan decision or an offer.</p>
      </Card>
    </>
  );
}
