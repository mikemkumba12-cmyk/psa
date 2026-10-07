import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Briefcase, ChevronRight, X, AlertCircle, Plus, Sparkles, Filter, UserCheck, ShieldAlert, Loader2, Edit2, Shield } from 'lucide-react';
import { platformApi } from '../lib/platformApi';
import { recordAuditEvent } from '../lib/auditTrail';
import { useAuth } from '../auth/AuthContext';
import { applicationsStore, repaymentsStore, auditStore } from '../lib/store';
import { computeOfficerQualityMetrics } from '../lib/intelligenceEngine';
import OfficerQualityScorecard from './OfficerQualityScorecard';

interface SafeStaffUser {
  id: string;
  role: 'admin' | 'executive' | 'manager' | 'loan_officer';
  fullName: string;
  email: string;
  phone: string;
  address: string;
  nationalId: string;
  createdAt: string;
  notificationPrefs: { sms: boolean; email: boolean; push: boolean };
  staffTitle?: string;
}

export default function AdminStaffManagement() {
  const { session } = useAuth();
  const userRole = session?.role || 'loan_officer';
  const isAdminOrManager = userRole === 'admin' || userRole === 'manager';

  const [staffList, setStaffList] = useState<SafeStaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<SafeStaffUser | null>(null);

  // Form states for new staff registration
  const [showAddForm, setShowAddForm] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [staffTitle, setStaffTitle] = useState('Loan Officer');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit state
  const [editingStaff, setEditingStaff] = useState<SafeStaffUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  if (!isAdminOrManager) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 bg-white dark:bg-[#1a1a1a] rounded-3xl border border-gray-100 dark:border-white/10 shadow-sm">
        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 text-amber-500 rounded-2xl flex items-center justify-center mb-4 border border-amber-200 dark:border-amber-500/20">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Restricted</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1.5 max-w-md leading-relaxed">
          Staff Directory and Team Management are reserved for **System Administrators** and **Operations Managers**. Loan Officers do not have permission to view or manage staff accounts.
        </p>
      </div>
    );
  }

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await platformApi.getStaffList();
      if (list) {
        setStaffList(list as SafeStaffUser[]);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load staff list.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !password.trim()) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const newStaff = await platformApi.createStaff({
        fullName,
        email,
        password,
        phone,
        staffTitle,
      });

      if (newStaff) {
        recordAuditEvent({
          actorId: session?.userId || 'system',
          actorName: session?.fullName || 'System',
          actorRole: 'staff',
          action: 'staff.create',
          entityType: 'user',
          entityId: (newStaff as SafeStaffUser).id,
          outcome: 'success',
          summary: `Staff user ${fullName} registered.`,
          metadata: { email, staffTitle },
        });
        await fetchStaff();
        setShowAddForm(false);
        setFullName('');
        setEmail('');
        setPassword('');
        setPhone('');
        setStaffTitle('Loan Officer');
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to create staff member.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !editFullName.trim()) return;
    setSubmitting(true);
    setFormError(null);

    try {
      const updated = await platformApi.updateStaff(editingStaff.id, {
        fullName: editFullName,
        phone: editPhone,
      });

      if (updated) {
        recordAuditEvent({
          actorId: session?.userId || 'system',
          actorName: session?.fullName || 'System',
          actorRole: 'staff',
          action: 'staff.update',
          entityType: 'user',
          entityId: editingStaff.id,
          outcome: 'success',
          summary: `Staff user ${editFullName} updated.`,
          metadata: { email: editingStaff.email },
        });
        await fetchStaff();
        setEditingStaff(null);
      }
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update staff member.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredStaff = staffList.filter(s =>
    s.fullName.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase())
  );

  const officerQuality = useMemo(() => computeOfficerQualityMetrics(
    applicationsStore.getAllUnfiltered(),
    repaymentsStore.getAllUnfiltered(),
    auditStore.getAll()
  ), []);

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/30">
              <UserCheck className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-on-surface">Staff Team & Decision Quality</h1>
          </div>
          <p className="text-sm text-secondary ml-10">Manage credentials and monitor decision quality & compliance metrics.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-primary text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Team Member
        </button>
      </div>

      {/* Decision Quality Scorecard */}
      <OfficerQualityScorecard officers={officerQuality} />

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3.5 top-3 text-secondary w-5 h-5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by staff name or email..."
          className="w-full h-11 pl-11 pr-4 bg-white border border-outline-variant/60 rounded-xl text-xs font-semibold"
        />
      </div>

      {/* Main List Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-xs text-secondary">Loading staff directories...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-xs text-red-700 dark:text-red-400">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>Error: {error}</p>
        </div>
      ) : (
        <section className="bg-white border border-outline-variant rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container/50 border-b border-surface-container text-secondary font-bold uppercase tracking-wider">
                  <th className="p-4 font-semibold">Staff Name</th>
                  <th className="p-4 font-semibold">Email</th>
                  <th className="p-4 font-semibold">Phone</th>
                  <th className="p-4 font-semibold">Joined At</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {filteredStaff.length > 0 ? (
                  filteredStaff.map((staff) => (
                    <tr key={staff.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="p-4 font-bold text-on-surface">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                            {staff.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div>{staff.fullName}</div>
                            <span className="text-[9px] text-gray-400 font-mono block -mt-0.5">{staff.id}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-secondary">{staff.email}</td>
                      <td className="p-4 text-on-surface font-semibold">{staff.phone || 'N/A'}</td>
                      <td className="p-4 text-secondary">
                        {new Date(staff.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center gap-3 justify-end">
                          <button
                            onClick={() => {
                              setEditingStaff(staff);
                              setEditFullName(staff.fullName);
                              setEditPhone(staff.phone || '');
                            }}
                            className="text-secondary hover:text-primary font-bold text-xs flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            onClick={() => setSelectedStaff(staff)}
                            className="text-primary font-bold text-xs hover:underline flex items-center gap-0.5"
                          >
                            Profile <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-secondary">
                      No staff members found matching criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* DETAIL MODAL */}
      {selectedStaff && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-outline-variant rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <div>
                <span className="text-[10px] font-bold text-secondary uppercase tracking-widest font-mono">Staff Registry Details</span>
                <h3 className="text-base font-bold text-on-surface mt-0.5">{selectedStaff.fullName}</h3>
              </div>
              <button
                onClick={() => setSelectedStaff(null)}
                className="p-1.5 hover:bg-surface-container rounded-lg text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                  <span className="text-[9px] font-bold text-secondary uppercase block">User ID</span>
                  <p className="text-xs font-bold text-on-surface mt-1 font-mono">{selectedStaff.id}</p>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                  <span className="text-[9px] font-bold text-secondary uppercase block">Primary Role</span>
                  <p className="text-xs font-bold text-on-surface mt-1 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" /> Credit Staff
                  </p>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                  <span className="text-[9px] font-bold text-secondary uppercase block">Email Address</span>
                  <p className="text-xs font-bold text-on-surface mt-1">{selectedStaff.email}</p>
                </div>

                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/30">
                  <span className="text-[9px] font-bold text-secondary uppercase block">Phone Contact</span>
                  <p className="text-xs font-bold text-on-surface mt-1">{selectedStaff.phone || 'N/A'}</p>
                </div>
              </div>

              <div className="bg-orange-50 dark:bg-orange-500/5 border border-orange-200 dark:border-orange-500/20 p-4 rounded-xl flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-primary" />
                <div>
                  <h4 className="text-xs font-bold text-primary">System Access & Auditability</h4>
                  <p className="text-[10px] text-secondary leading-relaxed">
                    This account is subject to Reserve Bank of Malawi MFI reporting regulations. All access logs are permanently recorded to the immutable ledger.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => setSelectedStaff(null)}
                  className="py-2.5 px-5 bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-xs font-bold rounded-xl text-secondary"
                >
                  Close Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD MEMBER MODAL */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddSubmit} className="bg-white border border-outline-variant rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <h3 className="text-base font-bold text-on-surface">Add Team Member</h3>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1.5 hover:bg-surface-container rounded-lg text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Banda"
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. jbanda@pinnacle.mw"
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Temporal Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +265..."
                    className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Staff Title</label>
                  <select
                    value={staffTitle}
                    onChange={(e) => setStaffTitle(e.target.value)}
                    className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-bold text-secondary"
                  >
                    <option value="Loan Officer">Loan Officer</option>
                    <option value="Senior Credit Analyst">Senior Analyst</option>
                    <option value="Risk Manager">Risk Manager</option>
                    <option value="Branch Manager">Branch Manager</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-primary text-white font-bold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-1.5"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Register Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT MEMBER MODAL */}
      {editingStaff && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleEditSubmit} className="bg-white border border-outline-variant rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-container flex justify-between items-center bg-surface-container-low">
              <h3 className="text-base font-bold text-on-surface">Edit Team Member</h3>
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="p-1.5 hover:bg-surface-container rounded-lg text-secondary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" /> {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Full Name</label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  placeholder="e.g. John Banda"
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-secondary uppercase tracking-wider block">Phone Number</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. +265..."
                  className="w-full h-11 border border-outline-variant/60 rounded-xl px-3 text-xs font-semibold focus:ring-1 focus:ring-primary"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-primary text-white font-bold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all mt-4 flex items-center justify-center gap-1.5"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

