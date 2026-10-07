import React, { useState, useEffect } from 'react';
import { ShieldCheck, ChevronRight, User, CreditCard, Landmark, Key, Fingerprint, Smartphone, Phone, FileText, Lock, LogOut, Bell, Sun, Moon, Edit2, CheckCircle, X, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateUserProfile, type UserProfile } from '../auth/authService';
import { platformApi } from '../lib/platformApi';
import { recordAuditEvent } from '../lib/auditTrail';

interface ClientProfileProps {
  onLogout: () => void;
  onEditDetail: (field: string) => void;
}

export default function ClientProfile({ onLogout, onEditDetail }: ClientProfileProps) {
  const { session, theme, toggleTheme } = useAuth();
  // Biometric/Device management coming in future
  const biometricEnabled = false; // Stub for now
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(session?.fullName || '');
  const [editPhone, setEditPhone] = useState(session?.phone || '');
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // Password change state
  const [showPassModal, setShowPassModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPass, setSubmittingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  useEffect(() => {
    if (!session) {
      setProfile(null);
      return;
    }

    let active = true;
    (async () => {
      const loaded = await getUserProfile(session.userId);
      if (!active) return;
      setProfile(loaded);
      if (loaded) {
        setEditName(loaded.fullName);
        setEditPhone(loaded.phone);
      }
    })();

    return () => {
      active = false;
    };
  }, [session]);

  const memberSince = profile ? new Date(profile.createdAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : 'N/A';

  const handleSave = async () => {
    if (!session) return;
    await updateUserProfile(session.userId, { fullName: editName, phone: editPhone });
    if (profile) {
      setProfile({ ...profile, fullName: editName, phone: editPhone });
    }
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      setPassError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPassError('New password must be at least 8 characters.');
      return;
    }

    setSubmittingPass(true);
    setPassError(null);

    try {
      const result = await platformApi.changePassword(currentPassword, newPassword);
      if (result?.success) {
        if (session) {
          recordAuditEvent({
            actorId: session.userId,
            actorName: session.fullName,
            actorRole: 'client',
            action: 'auth.password_change',
            entityType: 'user',
            entityId: session.userId,
            outcome: 'success',
            summary: 'Client changed profile account password.',
          });
        }
        setPassSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          setPassSuccess(false);
          setShowPassModal(false);
        }, 2000);
      }
    } catch (err: any) {
      setPassError(err?.message || 'Failed to change password. Make sure current password is correct.');
    } finally {
      setSubmittingPass(false);
    }
  };

  const cardBase = 'bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm';
  const rowBase = 'w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors text-left group';
  const sectionLabel = 'text-[11px] font-bold text-gray-400 dark:text-gray-500 px-1 uppercase tracking-widest';
  const divider = 'divide-y divide-gray-50 dark:divide-white/5';

  return (
    <div className="space-y-6 pb-6">
      {/* Profile card */}
      <section className={`${cardBase} p-5`}>
        {editing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-900 dark:text-white">Edit Profile</p>
              <button onClick={() => setEditing(false)} className="w-7 h-7 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Full Name</label>
              <input value={editName} onChange={e => setEditName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400/60" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Phone</label>
              <input value={editPhone} onChange={e => setEditPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400/60" />
            </div>
            <button onClick={handleSave} className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" /> Save Changes
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-black text-2xl shadow">
                {session?.fullName?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="absolute bottom-0 right-0 bg-green-500 p-1 rounded-full border-2 border-white dark:border-gray-800 text-white" title="Account verified">
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">{session?.fullName || 'User'}</h2>
              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400 mt-0.5">Verified Member</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Member since {memberSince}</p>
              {session?.email && <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{session.email}</p>}
            </div>
            <button onClick={() => setEditing(true)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
              <Edit2 className="w-4 h-4 text-gray-400" />
            </button>
          </div>
        )}
        {saved && (
          <div className="mt-3 flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-2.5">
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
            <p className="text-xs font-semibold text-green-700 dark:text-green-300">Profile updated successfully</p>
          </div>
        )}
      </section>

      {/* Account Details */}
      <section className="space-y-2">
        <p className={sectionLabel}>Account Details</p>
        <div className={`${cardBase} ${divider}`}>
          {[
            { label: 'Personal Information', icon: User, field: 'personal' },
            { label: 'Linked Bank Account', icon: Landmark, field: 'bank' },
            { label: 'Tax ID (TPIN)', icon: CreditCard, field: 'tax' },
          ].map(({ label, icon: Icon, field }) => (
            <button key={field} onClick={() => onEditDetail(field)} className={rowBase}>
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="space-y-2">
        <p className={sectionLabel}>Security</p>
        <div className={`${cardBase} ${divider}`}>
          <button onClick={() => setShowPassModal(true)} className={rowBase}>
            <div className="flex items-center gap-3">
              <Key className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-xs font-semibold text-gray-900 dark:text-white">Change PIN / Password</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-lg border border-dashed border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <div>
                <span className="text-xs font-semibold text-gray-900 dark:text-white block">Biometric Login</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">🔜 Coming soon</span>
              </div>
            </div>
            <span className="text-[9px] font-bold text-gray-400 bg-gray-200 dark:bg-white/10 px-2 py-1 rounded">Future</span>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-white/5 rounded-lg border border-dashed border-gray-200 dark:border-white/10">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <div>
                <span className="text-xs font-semibold text-gray-900 dark:text-white block">Device Management</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">🔜 Coming soon</span>
              </div>
            </div>
            <span className="text-[9px] font-bold text-gray-400 bg-gray-200 dark:bg-white/10 px-2 py-1 rounded">Future</span>
          </div>
        </div>
      </section>

      {/* Preferences */}
      <section className="space-y-2">
        <p className={sectionLabel}>Preferences</p>
        <div className={`${cardBase} ${divider}`}>
          <button onClick={() => onEditDetail('notifications')} className={rowBase}>
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              <span className="text-xs font-semibold text-gray-900 dark:text-white">Notification Settings</span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
          </button>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {theme === 'dark' ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-gray-400" />}
              <span className="text-xs font-semibold text-gray-900 dark:text-white">Dark Mode</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer" onClick={toggleTheme}>
              <div className={`w-10 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-orange-500' : 'bg-gray-200'} after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${theme === 'dark' ? 'after:translate-x-4' : ''}`} />
            </label>
          </div>
        </div>
      </section>

      {/* Support & Legal */}
      <section className="space-y-2">
        <p className={sectionLabel}>Support & Legal</p>
        <div className={`${cardBase} ${divider}`}>
          {[
            { label: 'Contact Pinnacle Support', icon: Phone, field: 'contact' },
            { label: 'Terms & Conditions', icon: FileText, field: 'terms' },
            { label: 'Privacy Policy', icon: Lock, field: 'privacy' },
          ].map(({ label, icon: Icon, field }) => (
            <button key={field} onClick={() => onEditDetail(field)} className={rowBase}>
              <div className="flex items-center gap-3">
                <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                <span className="text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:translate-x-0.5 transition-transform" />
            </button>
          ))}
        </div>
      </section>

      {/* Logout */}
      <div className="pt-2 pb-4">
        <button onClick={onLogout} className="w-full h-12 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/20 font-bold text-xs rounded-xl hover:bg-red-100 dark:hover:bg-red-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
        <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-4 font-semibold">
          Pinnacle Smart Advisor · PSA v2.0<br/>© 2026 Pinnacle MFI. All rights reserved.
        </p>
      </div>

      {/* PASSWORD CHANGE MODAL */}
      {showPassModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handlePasswordChange} className="bg-white dark:bg-[#141414] border border-outline-variant rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in duration-200">
            <div className="p-4 border-b border-surface-container flex justify-between items-center bg-surface-container-low dark:bg-white/5">
              <h3 className="text-sm font-bold text-on-surface">Change Profile Password</h3>
              <button type="button" onClick={() => { setShowPassModal(false); setPassError(null); }} className="p-1 hover:bg-surface-container rounded text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {passError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {passError}
                </div>
              )}
              {passSuccess && (
                <div className="p-3 bg-green-50 text-green-700 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" /> Password updated! Closing...
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Current Password</label>
                <input type="password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant/60 rounded-xl text-xs bg-transparent text-on-surface focus:outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">New Password</label>
                <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant/60 rounded-xl text-xs bg-transparent text-on-surface focus:outline-none" />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Confirm New Password</label>
                <input type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className="w-full h-10 px-3 border border-outline-variant/60 rounded-xl text-xs bg-transparent text-on-surface focus:outline-none" />
              </div>

              <button type="submit" disabled={submittingPass || passSuccess}
                className="w-full py-3 bg-primary text-white font-bold text-xs rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50">
                {submittingPass && <Loader2 className="w-4 h-4 animate-spin" />}
                Update Account Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
