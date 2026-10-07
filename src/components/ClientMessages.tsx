import React, { useState, useEffect, useRef } from 'react';
import { Search, Edit2, ShieldAlert, Award, Calendar, CheckCircle2, Send, X, ArrowLeft, MessageCircle, Loader2 } from 'lucide-react';
import { ChatConversation, AlertNotification } from '../types';
import { platformApi } from '../lib/platformApi';
import { hasApiBackend } from '../lib/apiClient';
import { recordAuditEvent } from '../lib/auditTrail';
import { useAuth } from '../auth/AuthContext';

interface ClientMessagesProps {
  chats: ChatConversation[];
  alerts: AlertNotification[];
  onPayInstallment: (id: string) => void;
  onClearUnread: (chatId: string) => void;
}

interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
}

export default function ClientMessages({ 
  chats, 
  alerts, 
  onPayInstallment, 
  onClearUnread 
}: ClientMessagesProps) {
  const { session } = useAuth();
  const [activeSegment, setActiveSegment] = useState<'chats' | 'alerts'>('chats');
  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selected conversation state
  const [selectedChat, setSelectedChat] = useState<any | null>(null);
  const [liveConversations, setLiveConversations] = useState<any[]>([]);
  const [liveMessages, setLiveMessages] = useState<MessageItem[]>([]);
  const [chatText, setChatText] = useState('');
  const [loadingConv, setLoadingConv] = useState(false);
  const [sending, setSending] = useState(false);
  
  const pollingInterval = useRef<any>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  // Load conversations from backend if available, otherwise fall back to store/props
  const loadConversations = async () => {
    if (!hasApiBackend() || !session) return;
    try {
      const list = await platformApi.getConversations();
      if (list) {
        setLiveConversations(list);
      }
    } catch (err) {
      console.warn("Failed to load conversations:", err);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 10000);
    return () => clearInterval(t);
  }, [session?.userId]);

  // Load messages for the active conversation
  const loadMessages = async (convId: string, scroll = false) => {
    if (!hasApiBackend()) return;
    try {
      const messages = await platformApi.getMessages(convId);
      if (messages) {
        setLiveMessages(messages as MessageItem[]);
        if (scroll) {
          setTimeout(() => messageEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        }
      }
    } catch (err) {
      console.warn("Failed to fetch messages:", err);
    }
  };

  // Start polling when a chat is selected
  useEffect(() => {
    if (selectedChat) {
      // Mark read immediately
      void platformApi.markRead(selectedChat.id);
      loadMessages(selectedChat.id, true);
      
      // Poll every 4 seconds for new messages
      pollingInterval.current = setInterval(() => {
        loadMessages(selectedChat.id, false);
      }, 4000);
    } else {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    }

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
    };
  }, [selectedChat?.id]);

  const handleSendMessage = async () => {
    if (!chatText.trim() || !selectedChat || !session) return;
    const text = chatText.trim();
    setChatText('');
    setSending(true);

    if (hasApiBackend()) {
      try {
        await platformApi.sendMessage(selectedChat.id, text);
        recordAuditEvent({
          actorId: session.userId,
          actorName: session.fullName,
          actorRole: 'client',
          action: 'messaging.send',
          entityType: 'message',
          outcome: 'success',
          summary: 'Client sent chat advisory message.',
        });
        await loadMessages(selectedChat.id, true);
      } catch (err) {
        console.warn("Failed to send message:", err);
        setChatText(text); // Restore text on failure
      } finally {
        setSending(false);
      }
    } else {
      // Static offline alert placeholder
      alert(`Offline mode: Message "${text}" simulate dispatch.`);
      setSending(false);
    }
  };

  const startNewConversation = async () => {
    if (!hasApiBackend() || !session) return;
    setLoadingConv(true);
    try {
      // Default to start a thread with staff-001 (Elena Rodriguez)
      const conv = await platformApi.getOrCreateConversation('staff-001');
      if (conv) {
        await loadConversations();
        setSelectedChat({
          id: conv.id,
          senderName: 'Elena Rodriguez',
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80',
          isOnline: true,
        });
      }
    } catch (err: any) {
      alert(`Unable to open conversation: ${err?.message}`);
    } finally {
      setLoadingConv(false);
    }
  };

  // Compile final conversation threads based on online status vs mock lists
  const displayConversations = hasApiBackend() 
    ? liveConversations.map(c => {
        const isStaffSender = c.last_msg?.sender_id === 'staff-001';
        return {
          id: c.id,
          senderName: 'Elena Rodriguez',
          avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=100&q=80',
          lastMessage: c.last_msg?.content || 'No messages yet',
          timestamp: c.last_msg?.sent_at ? new Date(c.last_msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
          unreadCount: Number(c.unread_count || 0),
          isOnline: true,
        };
      })
    : chats;

  const filteredChats = displayConversations.filter(chat => {
    const matchesQuery = chat.senderName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          chat.lastMessage.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesQuery) return false;
    if (chatFilter === 'unread') return chat.unreadCount > 0;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Segment Selector Toggle */}
      <div className="flex bg-surface-container p-1 rounded-2xl border border-outline-variant/15">
        <button 
          onClick={() => { setActiveSegment('chats'); setSelectedChat(null); }}
          className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all ${
            activeSegment === 'chats' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-on-surface'
          }`}
        >
          Conversations
        </button>
        <button 
          onClick={() => { setActiveSegment('alerts'); setSelectedChat(null); }}
          className={`flex-1 text-center py-2.5 rounded-xl font-bold text-xs transition-all ${
            activeSegment === 'alerts' ? 'bg-primary text-white shadow-sm' : 'text-secondary hover:text-on-surface'
          }`}
        >
          Recent Alerts
        </button>
      </div>

      {activeSegment === 'chats' ? (
        <>
          {selectedChat ? (
            /* ACTIVE CHAT SCREEN */
            <div className="bg-white dark:bg-[#141414] border border-outline-variant rounded-2xl flex flex-col shadow-sm h-[480px]">
              {/* Chat Header */}
              <div className="p-4 border-b border-surface-container flex items-center gap-3">
                <button 
                  onClick={() => setSelectedChat(null)}
                  className="p-1.5 hover:bg-surface-container dark:hover:bg-white/5 rounded-lg text-primary"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="relative">
                  <img src={selectedChat.avatarUrl} alt={selectedChat.senderName} className="w-10 h-10 rounded-full object-cover" />
                  {selectedChat.isOnline && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#141414] rounded-full"></div>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-on-surface">{selectedChat.senderName}</h3>
                  <p className="text-[10px] text-secondary">{selectedChat.isOnline ? 'Online' : 'Advisor'}</p>
                </div>
              </div>

              {/* Messages Body */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-container-low dark:bg-[#0f0f0f] no-scrollbar">
                {hasApiBackend() ? (
                  liveMessages.map((msg, index) => {
                    const isMe = msg.sender_id === session?.userId;
                    return (
                      <div key={msg.id || index} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] rounded-2xl p-3 text-xs leading-relaxed ${
                          isMe 
                            ? 'bg-primary text-white rounded-tr-none' 
                            : 'bg-white dark:bg-[#181818] border border-outline-variant/30 text-on-surface rounded-tl-none'
                        }`}>
                          {msg.content}
                        </div>
                        <span className="text-[9px] text-secondary mt-1 px-1">
                          {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-xs text-secondary">
                    Offline messaging fallback is simulated in local logs.
                  </div>
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Message Input Footer */}
              <div className="p-3 border-t border-surface-container flex items-center gap-2 bg-white dark:bg-[#141414] rounded-b-2xl">
                <input 
                  type="text" 
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !sending && handleSendMessage()}
                  placeholder="Type your message here..."
                  className="flex-1 text-xs border border-outline-variant/50 rounded-xl px-4 py-3 bg-transparent text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-container"
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={sending}
                  className="bg-primary text-white p-3 rounded-xl hover:brightness-105 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* CONVERSATIONS INBOX SCREEN */
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative flex items-center">
                <Search className="absolute left-4 text-secondary w-5 h-5" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full h-12 pl-11 pr-4 bg-surface-container-low dark:bg-white/5 border-none rounded-2xl focus:ring-1 focus:ring-primary text-xs font-medium text-on-surface"
                />
              </div>

              {/* Quick Filter Chips */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button 
                  onClick={() => setChatFilter('all')}
                  className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
                    chatFilter === 'all' ? 'bg-primary text-white' : 'bg-surface-container-high dark:bg-white/10 text-secondary'
                  }`}
                >
                  All Messages
                </button>
                <button 
                  onClick={() => setChatFilter('unread')}
                  className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap ${
                    chatFilter === 'unread' ? 'bg-primary text-white' : 'bg-surface-container-high dark:bg-white/10 text-secondary'
                  }`}
                >
                  Unread
                </button>
              </div>

              {/* Chat list */}
              <div className="bg-white dark:bg-[#141414] border border-outline-variant rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container">
                {filteredChats.length > 0 ? (
                  filteredChats.map((chat) => (
                    <div 
                      key={chat.id} 
                      onClick={() => setSelectedChat(chat)}
                      className="flex items-center gap-4 p-4 hover:bg-surface-container-low dark:hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <div className="relative flex-shrink-0">
                        <img src={chat.avatarUrl} alt={chat.senderName} className="w-12 h-12 rounded-full object-cover" />
                        {chat.isOnline && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white dark:border-[#141414] rounded-full"></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <h3 className="text-xs font-bold text-on-surface truncate">{chat.senderName}</h3>
                          <span className="text-[10px] text-secondary font-medium">{chat.timestamp}</span>
                        </div>
                        <div className="flex justify-between items-center gap-2 mt-0.5">
                          <p className={`text-xs truncate ${chat.unreadCount > 0 ? 'text-on-surface font-bold' : 'text-secondary'}`}>
                            {chat.lastMessage}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="flex-shrink-0 bg-primary text-white text-[9px] font-bold w-4.5 h-4.5 rounded-full flex items-center justify-center">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-secondary">
                    <MessageCircle className="w-10 h-10 mx-auto opacity-30 mb-2" />
                    <p className="text-xs">No conversations active.</p>
                  </div>
                )}
              </div>

              {/* Compose message button */}
              {hasApiBackend() && (
                <div className="flex justify-end pt-2">
                  <button 
                    onClick={startNewConversation}
                    disabled={loadingConv}
                    className="bg-primary text-white p-4 rounded-2xl shadow-lg hover:scale-105 active:scale-95 transition-transform disabled:opacity-60"
                    title="Start new conversation with advisor"
                  >
                    {loadingConv ? <Loader2 className="w-5 h-5 animate-spin" /> : <Edit2 className="w-5 h-5" />}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* ALERTS AND NOTIFICATIONS TIMELINE */
        <div className="space-y-5">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-[11px] font-bold text-secondary uppercase tracking-widest">Recent Activity</h3>
            <button 
              onClick={() => onClearUnread('all')}
              className="text-xs font-bold text-primary hover:underline"
            >
              Mark all read
            </button>
          </div>

          <div className="relative border-l-2 border-surface-container-highest dark:border-white/10 pl-6 ml-4 space-y-6">
            {alerts.map((alertItem) => (
              <div key={alertItem.id} className="relative group">
                <div className="absolute -left-10 top-0 w-8 h-8 rounded-full border-4 border-background dark:border-[#0f0f0f] flex items-center justify-center shadow-sm">
                  {alertItem.type === 'critical' ? (
                    <div className="w-full h-full bg-error-container text-error rounded-full flex items-center justify-center">
                      <ShieldAlert className="w-4 h-4 text-error" />
                    </div>
                  ) : alertItem.type === 'approval' ? (
                    <div className="w-full h-full bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 rounded-full flex items-center justify-center">
                      <Award className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-full flex items-center justify-center">
                      <Calendar className="w-4 h-4" />
                    </div>
                  )}
                </div>

                <div className="bg-white dark:bg-[#141414] border border-outline-variant rounded-2xl p-4 shadow-sm space-y-3">
                  {alertItem.imageBackground && (
                    <div 
                      className="h-32 -mx-4 -mt-4 bg-cover bg-center rounded-t-2xl"
                      style={{ backgroundImage: `url('${alertItem.imageBackground}')` }}
                    ></div>
                  )}
                  
                  <div className="flex justify-between items-start">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${
                      alertItem.type === 'critical' ? 'text-error' : alertItem.type === 'approval' ? 'text-green-700' : 'text-primary'
                    }`}>
                      {alertItem.type === 'critical' ? 'Critical Alert' : alertItem.type === 'approval' ? 'Approval' : 'Opportunity'}
                    </span>
                    <span className="text-[10px] text-secondary font-medium">{alertItem.date}</span>
                  </div>

                  <h3 className="text-sm font-bold text-on-surface">{alertItem.title}</h3>
                  <p className="text-xs text-secondary leading-relaxed">{alertItem.description}</p>
                  
                  {alertItem.actionLabel && (
                    <button 
                      onClick={() => {
                        if (alertItem.actionLabel === 'Pay Now') {
                          onPayInstallment('REP-6');
                        } else {
                          alert(`Simulating action: "${alertItem.title}"`);
                        }
                      }}
                      className="w-full py-2.5 bg-primary text-white font-bold text-xs rounded-xl hover:brightness-105 active:scale-[0.98] transition-all"
                    >
                      {alertItem.actionLabel}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
