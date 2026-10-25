import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Send } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { dateTime, relative } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../ui/Feedback';
import { TextArea, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';

interface ConversationSummary { id: string; subject: string; customerName: string; staffName: string | null; lastMessage: string | null; lastMessageAt: string; unread: number }
interface Thread { id: string; subject: string; messages: Array<{ id: string; mine: boolean; senderName: string; fromStaff: boolean; content: string; sentAt: string }> }

export function MessagesPage() {
  const { isStaff } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const base = isStaff ? '/staff/messages' : '/client/messages';
  const list = useResource<ConversationSummary[]>('/api/conversations');
  const [composing, setComposing] = useState(false);

  return (
    <>
      <PageHeader title="Messages" description={isStaff ? 'Customer enquiries.' : 'Secure messages with Pinnacle staff.'}
        actions={!isStaff && <Button onClick={() => setComposing(true)}>New message</Button>} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card padded={false} className={id ? 'hidden lg:block' : ''}>
          {list.error && <ErrorState error={list.error} onRetry={list.reload} />}
          {list.loading && !list.data && <LoadingBlock />}
          {list.data?.length === 0 && <EmptyState title="No messages yet">{isStaff ? 'Customer messages will appear here.' : 'Ask about your application or loan.'}</EmptyState>}
          <ul className="divide-y divide-line">
            {list.data?.map(item => (
              <li key={item.id}>
                <Link to={`${base}/${item.id}`} className={`block px-4 py-3 hover:bg-surface-muted ${item.id === id ? 'bg-brand-50' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate font-semibold text-ink">{item.subject}</p>
                    {item.unread > 0 && <span className="shrink-0 rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">{item.unread}</span>}
                  </div>
                  <p className="truncate text-sm text-ink-muted">{isStaff ? item.customerName : item.staffName ?? 'Pinnacle'} · {relative(item.lastMessageAt)}</p>
                  {item.lastMessage && <p className="mt-0.5 truncate text-sm text-ink-subtle">{item.lastMessage}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <div className={id ? '' : 'hidden lg:block'}>
          {id ? <ThreadView id={id} onBack={() => navigate(base)} onSent={list.reload} /> : <Card><EmptyState title="Choose a conversation" /></Card>}
        </div>
      </div>
      {composing && <ComposeModal onClose={() => setComposing(false)} onCreated={newId => { setComposing(false); void list.reload(); navigate(`${base}/${newId}`); }} />}
    </>
  );
}

function ThreadView({ id, onBack, onSent }: { id: string; onBack: () => void; onSent: () => void }) {
  const { data, error, loading, reload } = useResource<Thread>(`/api/conversations/${id}/messages`);
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [data]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    setPending(true);
    setSendError(null);
    try {
      await api(`/api/conversations/${id}/messages`, { body: { content: text } });
      setText('');
      await reload();
      onSent();
    } catch (caught) {
      setSendError(caught instanceof ApiError ? caught.message : 'Message not sent.');
    } finally {
      setPending(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return loading ? <LoadingBlock /> : null;
  return (
    <Card title={data.subject} actions={<Button size="sm" variant="ghost" className="lg:hidden" onClick={onBack}>All messages</Button>}>
      <div className="max-h-[55dvh] space-y-3 overflow-y-auto pr-1">
        {data.messages.map(message => (
          <div key={message.id} className={`flex ${message.mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${message.mine ? 'bg-brand-600 text-white' : 'bg-surface-muted text-ink'}`}>
              {!message.mine && <p className="mb-0.5 text-xs font-semibold">{message.senderName}</p>}
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              <p className={`mt-1 text-[11px] ${message.mine ? 'text-white/80' : 'text-ink-subtle'}`}>{dateTime(message.sentAt)}</p>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={send} className="mt-4 flex items-end gap-2 border-t border-line pt-4">
        <TextArea label="Reply" rows={2} value={text} onChange={event => setText(event.target.value)} fieldClassName="flex-1" />
        <Button type="submit" loading={pending} disabled={!text.trim()} icon={<Send className="h-4 w-4" />} aria-label="Send">
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
      {sendError && <div className="mt-2"><Alert tone="danger">{sendError}</Alert></div>}
    </Card>
  );
}

function ComposeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const send = async () => {
    setPending(true);
    setError(null);
    try {
      const created = await api<{ id: string }>('/api/conversations', { body: { subject, message } });
      onCreated(created.id);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Message not sent.');
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="New message" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={send} loading={pending} disabled={!subject || !message}>Send</Button></>}>
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <TextInput label="Subject" value={subject} onChange={event => setSubject(event.target.value)} placeholder="e.g. Question about my application" />
        <TextArea label="Message" rows={5} value={message} onChange={event => setMessage(event.target.value)} hint="Please don’t send passwords or full card numbers." />
      </div>
    </Modal>
  );
}
