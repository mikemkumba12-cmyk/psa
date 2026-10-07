import React, { useState, useEffect } from 'react';
import { Bell, MessageSquare, Mail, Smartphone, ChevronLeft, CheckCircle, Volume2, Loader2 } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { recordAuditEvent } from '../lib/auditTrail';
import { updateUserProfile, getUserProfile } from '../auth/authService';

interface NotificationSettingsProps {
  onBack: () => void;
}

interface NotifPref {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  enabled: boolean;
}

interface NotifEvent {
  id: string;
  label: string;
  sms: boolean;
  email: boolean;
  push: boolean;
}

export default function NotificationSettings({ onBack }: NotificationSettingsProps) {
  const { session } = useAuth();
  const [channels, setChannels] = useState<NotifPref[]>([
    { id: 'push', label: 'In-App Alerts', description: 'Push notifications in the PSA app', icon: Bell, iconColor: 'text-orange-600', iconBg: 'bg-orange-100', enabled: true },
    { id: 'sms', label: 'SMS Alerts', description: '🔜 Coming Soon - Text messages to your phone', icon: Smartphone, iconColor: 'text-gray-400', iconBg: 'bg-gray-100', enabled: false },
    { id: 'email', label: 'Email Notifications', description: '🔜 Coming Soon - Sent to your registered email', icon: Mail, iconColor: 'text-gray-400', iconBg: 'bg-gray-100', enabled: false },
    { id: 'whatsapp', label: 'WhatsApp Messages', description: '🔜 Coming Soon - Via your WhatsApp number', icon: MessageSquare, iconColor: 'text-gray-400', iconBg: 'bg-gray-100', enabled: false },
  ]);

  const [events, setEvents] = useState<NotifEvent[]>([
    { id: 'repayment', label: 'Repayment Reminders', sms: true, email: true, push: true },
    { id: 'status', label: 'Application Status Changes', sms: true, email: true, push: true },
    { id: 'approval', label: 'Loan Approval / Rejection', sms: true, email: true, push: true },
    { id: 'disbursement', label: 'Loan Disbursement', sms: true, email: false, push: true },
    { id: 'overdue', label: 'Overdue Payment Alerts', sms: true, email: true, push: true },
    { id: 'statement', label: 'Monthly Statement', sms: false, email: true, push: false },
  ]);

  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load saved prefs from profile on mount
  useEffect(() => {
    if (!session) return;
    let active = true;
    (async () => {
      try {
        const profile = await getUserProfile(session.userId);
        if (!active || !profile) return;
        const prefs = profile.notificationPrefs;
        if (prefs) {
          setChannels(prev => prev.map(c =>
            c.id === 'sms' ? { ...c, enabled: prefs.sms } :
            c.id === 'email' ? { ...c, enabled: prefs.email } :
            c.id === 'push' ? { ...c, enabled: prefs.push } :
            c
          ));
        }
        // Also load any locally saved detailed event prefs
        const raw = localStorage.getItem(`psa_notification_events_${session.userId}`);
        if (raw) {
          try { setEvents(JSON.parse(raw)); } catch { /* ignore */ }
        }
      } catch { /* profile load failed, use defaults */ }
    })();
    return () => { active = false; };
  }, [session]);

  const toggleChannel = (id: string) => {
    // Only allow toggling in-app alerts; others are coming soon
    if (id !== 'push') {
      return;
    }
    setChannels(prev => prev.map(c => c.id === id ? { ...c, enabled: !c.enabled } : c));
  };

  const toggleEvent = (eventId: string, channel: 'sms' | 'email' | 'push') => {
    // Only allow toggling push events; email/SMS are coming soon
    if (channel !== 'push') {
      return;
    }
    setEvents(prev => prev.map(e => e.id === eventId ? { ...e, [channel]: !e[channel] } : e));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Persist core prefs (sms/email/push) to user profile (syncs to backend)
      const smsEnabled = channels.find(c => c.id === 'sms')?.enabled ?? true;
      const emailEnabled = channels.find(c => c.id === 'email')?.enabled ?? true;
      const pushEnabled = channels.find(c => c.id === 'push')?.enabled ?? true;

      if (session) {
        await updateUserProfile(session.userId, {
          notificationPrefs: { sms: smsEnabled, email: emailEnabled, push: pushEnabled },
        });
        // Save detailed event prefs locally (not yet in user schema)
        localStorage.setItem(`psa_notification_events_${session.userId}`, JSON.stringify(events));
        recordAuditEvent({
          actorId: session.userId,
          actorName: session.fullName,
          actorRole: 'client',
          action: 'notifications.preferences_update',
          entityType: 'notification_preferences',
          entityId: session.userId,
          outcome: 'success',
          summary: 'Client updated notification preferences.',
          metadata: {
            activeChannels: channels.filter(c => c.enabled).length,
            configuredEvents: events.length,
          },
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-all duration-200 ${enabled ? 'bg-orange-500' : 'bg-gray-200 dark:bg-white/10'}`}
      aria-pressed={enabled}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-all duration-200 ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  );

  const Dot = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
    <button
      onClick={onToggle}
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${active ? 'bg-orange-500 border-orange-500' : 'border-gray-300 dark:border-white/20 bg-white dark:bg-white/5'}`}
      aria-pressed={active}
    >
      {active && <div className="w-2 h-2 bg-white rounded-full" />}
    </button>
  );

  return (
    <div className="space-y-5">      {/* Coming Soon Banner */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-2xl p-4 flex items-start gap-3">
        <Bell className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-900 dark:text-blue-200">Enhanced Notification Channels Coming Soon</p>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">We're working on SMS, Email, and WhatsApp integrations. For now, you can receive notifications within the app.</p>
        </div>
      </div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Notification Settings</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Choose how Pinnacle contacts you</p>
        </div>
      </div>

      {/* Channel Toggles */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Notification Channels</h3>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Select which channels you'd like to receive messages on</p>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-white/5">
          {channels.map(channel => {
            const Icon = channel.icon;
            return (
              <div key={channel.id} className="flex items-center justify-between px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${channel.iconBg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${channel.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-900 dark:text-white">{channel.label}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{channel.description}</p>
                  </div>
                </div>
                <Toggle enabled={channel.enabled} onToggle={() => toggleChannel(channel.id)} />
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-event toggles */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-50 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02]">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Alert Preferences</h3>
          <div className="flex gap-4 mt-2">
            {['SMS', 'Email', 'Push'].map(col => (
              <span key={col} className="flex-1 text-center text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">{col}</span>
            ))}
          </div>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-white/5">
          {events.map(event => (
            <div key={event.id} className="flex items-center px-5 py-4 gap-3">
              <p className="flex-1 text-xs font-semibold text-gray-900 dark:text-white">{event.label}</p>
              <div className="flex gap-4">
                <div className="flex justify-center"><Dot active={event.sms} onToggle={() => toggleEvent(event.id, 'sms')} /></div>
                <div className="flex justify-center"><Dot active={event.email} onToggle={() => toggleEvent(event.id, 'email')} /></div>
                <div className="flex justify-center"><Dot active={event.push} onToggle={() => toggleEvent(event.id, 'push')} /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {saving
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
          : saved
            ? <><CheckCircle className="w-4 h-4" /> Preferences Saved!</>
            : 'Save Notification Settings'}
      </button>

      {/* Info note */}
      <div className="bg-orange-50 dark:bg-orange-500/5 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4">
        <p className="text-[11px] text-orange-800 dark:text-orange-300 leading-relaxed">
          📱 <strong>Critical alerts</strong> (missed payments, fraud flags) are always sent via all active channels regardless of preferences above.
        </p>
      </div>
    </div>
  );
}
