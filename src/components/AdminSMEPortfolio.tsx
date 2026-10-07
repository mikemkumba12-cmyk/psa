import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Building2, MapPin, ShieldCheck, AlertCircle, Filter, X,
  Users, FileText, ChevronRight, Briefcase, CheckCircle2, Clock,
  Activity, PieChart, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { businessesStore, customersStore, applicationsStore, repaymentsStore, payrollStore } from '../lib/store';
import { platformApi } from '../lib/platformApi';
import { loadBusinesses } from '../lib/dataService';
import { recordAuditEvent } from '../lib/auditTrail';
import { computeEmployerPerformance } from '../lib/intelligenceEngine';
import EmployerIntelligenceCard from './EmployerIntelligenceCard';
import type { BusinessTimelineEvent, BusinessVerificationStatus, SmeBusiness } from '../types';

function formatMoney(value: number): string {
  return `MWK ${value.toLocaleString()}`;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function statusClass(status: BusinessVerificationStatus): string {
  if (status === 'Verified') return 'bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20';
  if (status === 'Needs Documents') return 'bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20';
  if (status === 'Pending Verification') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20';
  return 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-white/5 dark:text-gray-300 dark:border-white/10';
}

function riskClass(risk: SmeBusiness['riskLevel']): string {
  if (risk === 'Low') return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-500/10 dark:border-green-500/20';
  if (risk === 'Medium') return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
  return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20';
}

export default function AdminSMEPortfolio() {
  const { session } = useAuth();
  const [businesses, setBusinesses] = useState(() => businessesStore.getAll());
  const [search, setSearch] = useState('');
  const [sectorFilter, setSectorFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedBusiness, setSelectedBusiness] = useState<SmeBusiness | null>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      const loaded = await loadBusinesses();
      if (!active) return;
      setBusinesses(loaded);
      setSelectedBusiness(current => current ? loaded.find(item => item.id === current.id) || null : null);
    })();

    return () => {
      active = false;
    };
  }, []);

  const sectors = useMemo(() => ['All', ...Array.from(new Set(businesses.map(item => item.sector)))], [businesses]);

  const filteredBusinesses = useMemo(() => businesses.filter(business => {
    const term = search.toLowerCase();
    const matchesSearch = business.name.toLowerCase().includes(term)
      || business.customerName.toLowerCase().includes(term)
      || business.location.toLowerCase().includes(term)
      || business.registrationNumber.toLowerCase().includes(term);
    const matchesSector = sectorFilter === 'All' || business.sector === sectorFilter;
    const matchesStatus = statusFilter === 'All' || business.verificationStatus === statusFilter;
    return matchesSearch && matchesSector && matchesStatus;
  }), [businesses, search, sectorFilter, statusFilter]);

  const metrics = useMemo(() => {
    const totalMonthlyRevenue = businesses.reduce((sum, business) => sum + business.monthlyRevenue, 0);
    const pendingRequests = businesses.reduce((sum, business) => sum + business.financingRequests.filter(request => ['Submitted', 'Under Review'].includes(request.status)).length, 0);
    return {
      total: businesses.length,
      verified: businesses.filter(business => business.verificationStatus === 'Verified').length,
      needsDocuments: businesses.filter(business => business.verificationStatus === 'Needs Documents').length,
      totalMonthlyRevenue,
      pendingRequests,
    };
  }, [businesses]);

  const sectorSummary = useMemo(() => sectors
    .filter(sector => sector !== 'All')
    .map(sector => ({
      sector,
      count: businesses.filter(business => business.sector === sector).length,
      revenue: businesses.filter(business => business.sector === sector).reduce((sum, business) => sum + business.monthlyRevenue, 0),
    }))
    .sort((a, b) => b.revenue - a.revenue), [businesses, sectors]);

  const refresh = () => {
    const next = businessesStore.getAll();
    setBusinesses(next);
    if (selectedBusiness) {
      setSelectedBusiness(next.find(item => item.id === selectedBusiness.id) || null);
    }
  };

  const updateVerification = (business: SmeBusiness, status: BusinessVerificationStatus) => {
    const timelineEvent: BusinessTimelineEvent = {
      id: makeId('biz-tl'),
      businessId: business.id,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }),
      title: status === 'Verified' ? 'Business verified' : 'Documents requested',
      detail: status === 'Verified'
        ? `${session?.fullName || 'Staff'} verified the SME profile for credit operations.`
        : `${session?.fullName || 'Staff'} requested additional SME documents before approval.`,
      type: 'verification',
    };

    businessesStore.update(business.id, { verificationStatus: status });
    businessesStore.addTimelineEvent(business.id, timelineEvent);
    void platformApi.updateBusiness(business.id, { verificationStatus: status });
    void platformApi.createBusinessTimelineEvent(business.id, timelineEvent);
    recordAuditEvent({
      actorId: session?.userId || 'staff-local',
      actorName: session?.fullName || 'Staff User',
      actorRole: 'staff',
      action: 'sme_business.verification_update',
      entityType: 'sme_business',
      entityId: business.id,
      outcome: 'success',
      summary: `Staff changed ${business.name} verification status to ${status}.`,
      metadata: { verificationStatus: status, sector: business.sector },
    });
    refresh();
  };

  const employerPerformances = useMemo(() => computeEmployerPerformance(
    customersStore.getAll(),
    applicationsStore.getAllUnfiltered(),
    repaymentsStore.getAllUnfiltered(),
    payrollStore.getAllRecords()
  ), []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface dark:text-white">SME & Employer Portfolio</h1>
          <p className="text-sm text-secondary dark:text-gray-400">Employer risk rating, payroll deduction performance, business verification, and pipeline.</p>
        </div>
        <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 px-3 py-1.5 rounded-full w-fit">
          {metrics.verified}/{metrics.total} verified
        </span>
      </div>

      {/* Employer Risk Intelligence */}
      <EmployerIntelligenceCard employers={employerPerformances} />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Registered SMEs', value: metrics.total, sub: `${metrics.needsDocuments} need documents`, Icon: Building2, color: 'text-primary bg-primary/10' },
          { label: 'Verified Entities', value: metrics.verified, sub: 'Ready for financing', Icon: ShieldCheck, color: 'text-green-700 bg-green-50 dark:bg-green-500/10' },
          { label: 'Monthly Revenue', value: formatMoney(metrics.totalMonthlyRevenue), sub: 'Tracked across SMEs', Icon: TrendingUp, color: 'text-blue-600 bg-blue-50 dark:bg-blue-500/10' },
          { label: 'Financing Queue', value: metrics.pendingRequests, sub: 'Submitted or reviewing', Icon: Briefcase, color: 'text-amber-700 bg-amber-50 dark:bg-amber-500/10' },
        ].map(({ label, value, sub, Icon, color }) => (
          <div key={label} className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">{label}</span>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-lg font-black text-on-surface dark:text-white">{value}</p>
            <p className="text-[10px] text-secondary dark:text-gray-500 font-semibold mt-0.5">{sub}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-surface-container dark:border-white/10 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3.5 top-3 text-secondary w-4 h-4" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search business, owner, branch, reg no..."
                className="w-full h-10 pl-10 pr-3 bg-surface-container-low dark:bg-white/[0.04] border border-outline-variant/60 dark:border-white/10 rounded-xl text-xs font-semibold"
              />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-3 text-secondary w-4 h-4" />
              <select value={sectorFilter} onChange={event => setSectorFilter(event.target.value)} className="w-full h-10 pl-9 pr-3 bg-surface-container-low dark:bg-white/[0.04] border border-outline-variant/60 dark:border-white/10 rounded-xl text-xs font-bold text-secondary dark:text-gray-300 appearance-none">
                {sectors.map(sector => <option key={sector} value={sector}>{sector}</option>)}
              </select>
            </div>
            <div className="relative">
              <AlertCircle className="absolute left-3 top-3 text-secondary w-4 h-4" />
              <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="w-full h-10 pl-9 pr-3 bg-surface-container-low dark:bg-white/[0.04] border border-outline-variant/60 dark:border-white/10 rounded-xl text-xs font-bold text-secondary dark:text-gray-300 appearance-none">
                {['All', 'Pending Verification', 'Verified', 'Needs Documents', 'Draft'].map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container/50 dark:bg-white/[0.03] border-b border-surface-container dark:border-white/10 text-secondary dark:text-gray-500 font-bold uppercase tracking-wider">
                  <th className="p-4 font-semibold">Business</th>
                  <th className="p-4 font-semibold">Owner</th>
                  <th className="p-4 font-semibold">Sector</th>
                  <th className="p-4 font-semibold">Verification</th>
                  <th className="p-4 font-semibold">Risk</th>
                  <th className="p-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container dark:divide-white/10">
                {filteredBusinesses.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-secondary">No SME businesses found.</td></tr>
                ) : filteredBusinesses.map(business => (
                  <tr key={business.id} className="hover:bg-surface-container-low dark:hover:bg-white/[0.03] transition-colors">
                    <td className="p-4">
                      <p className="font-bold text-on-surface dark:text-white">{business.name}</p>
                      <p className="text-[10px] text-secondary dark:text-gray-500 font-mono">{business.registrationNumber}</p>
                      <div className="flex items-center gap-1 text-[10px] text-secondary dark:text-gray-500 mt-1"><MapPin className="w-3 h-3" /> {business.location}</div>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-on-surface dark:text-white">{business.customerName}</p>
                      <p className="text-[10px] text-secondary dark:text-gray-500">{business.owners.length} relationship link(s)</p>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-on-surface dark:text-white">{business.sector}</p>
                      <p className="text-[10px] text-secondary dark:text-gray-500">{business.industryCategory}</p>
                    </td>
                    <td className="p-4"><span className={`border px-2 py-1 rounded-full text-[10px] font-bold ${statusClass(business.verificationStatus)}`}>{business.verificationStatus}</span></td>
                    <td className="p-4"><span className={`border px-2 py-1 rounded-full text-[10px] font-bold ${riskClass(business.riskLevel)}`}>{business.riskLevel}</span></td>
                    <td className="p-4 text-right">
                      <button onClick={() => setSelectedBusiness(business)} className="text-primary font-bold text-xs hover:underline inline-flex items-center gap-0.5">
                        Review <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-on-surface dark:text-white">Industry Categorization</h2>
          </div>
          <div className="space-y-3">
            {sectorSummary.map(item => {
              const width = metrics.totalMonthlyRevenue ? Math.max(8, (item.revenue / metrics.totalMonthlyRevenue) * 100) : 0;
              return (
                <div key={item.sector}>
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs font-bold text-on-surface dark:text-white">{item.sector}</span>
                    <span className="text-[10px] text-secondary dark:text-gray-500">{item.count} SMEs</span>
                  </div>
                  <div className="h-2 bg-surface-container dark:bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
                  </div>
                  <p className="text-[10px] text-secondary dark:text-gray-500 mt-1">{formatMoney(item.revenue)} monthly revenue</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selectedBusiness && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#171717] border border-outline-variant dark:border-white/10 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-surface-container dark:border-white/10 flex justify-between items-start bg-surface-container-low dark:bg-white/[0.03]">
              <div>
                <p className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest font-mono">SME Verification File</p>
                <h3 className="text-base font-bold text-on-surface dark:text-white mt-0.5">{selectedBusiness.name}</h3>
                <p className="text-xs text-secondary dark:text-gray-400">{selectedBusiness.customerName} - {selectedBusiness.registrationNumber}</p>
              </div>
              <button onClick={() => setSelectedBusiness(null)} className="p-1.5 hover:bg-surface-container rounded-lg text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
                  <p className="text-[9px] text-secondary uppercase font-bold">Health Score</p>
                  <p className="text-sm font-black text-primary mt-1">{selectedBusiness.healthScore}/100</p>
                </div>
                <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
                  <p className="text-[9px] text-secondary uppercase font-bold">Monthly Revenue</p>
                  <p className="text-sm font-black text-on-surface dark:text-white mt-1">{formatMoney(selectedBusiness.monthlyRevenue)}</p>
                </div>
                <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
                  <p className="text-[9px] text-secondary uppercase font-bold">Employees</p>
                  <p className="text-sm font-black text-on-surface dark:text-white mt-1">{selectedBusiness.employees}</p>
                </div>
                <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
                  <p className="text-[9px] text-secondary uppercase font-bold">Manager</p>
                  <p className="text-sm font-black text-on-surface dark:text-white mt-1 truncate">{selectedBusiness.relationshipManager}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <section className="space-y-2">
                  <h4 className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Ownership Relationships</h4>
                  <div className="border border-outline-variant dark:border-white/10 rounded-xl divide-y divide-surface-container dark:divide-white/10 overflow-hidden">
                    {selectedBusiness.owners.map(owner => (
                      <div key={`${owner.customerId}-${owner.role}`} className="p-3 flex justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-on-surface dark:text-white">{owner.customerName}</p>
                          <p className="text-[10px] text-secondary dark:text-gray-500">{owner.role}</p>
                        </div>
                        <span className="text-xs font-black text-primary">{owner.ownershipPct}%</span>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="space-y-2">
                  <h4 className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Documents</h4>
                  <div className="border border-outline-variant dark:border-white/10 rounded-xl divide-y divide-surface-container dark:divide-white/10 overflow-hidden">
                    {selectedBusiness.documents.length === 0 ? (
                      <p className="p-3 text-xs text-secondary">No documents attached.</p>
                    ) : selectedBusiness.documents.map(doc => (
                      <div key={doc.id} className="p-3 flex justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-on-surface dark:text-white truncate">{doc.name}</p>
                          <p className="text-[10px] text-secondary dark:text-gray-500">{doc.category}</p>
                        </div>
                        <span className="text-[10px] font-bold text-primary">{doc.status}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Financing Requests</h4>
                <div className="border border-outline-variant dark:border-white/10 rounded-xl divide-y divide-surface-container dark:divide-white/10 overflow-hidden">
                  {selectedBusiness.financingRequests.length === 0 ? (
                    <p className="p-3 text-xs text-secondary">No financing requests submitted.</p>
                  ) : selectedBusiness.financingRequests.map(request => (
                    <div key={request.id} className="p-3 flex justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-on-surface dark:text-white">{request.productName}</p>
                        <p className="text-[10px] text-secondary dark:text-gray-500">{formatMoney(request.amount)} over {request.termMonths} months</p>
                      </div>
                      <span className="text-[10px] font-bold text-primary">{request.status}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h4 className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Timeline</h4>
                <div className="border border-outline-variant dark:border-white/10 rounded-xl divide-y divide-surface-container dark:divide-white/10 overflow-hidden">
                  {selectedBusiness.timeline.map(item => (
                    <div key={item.id} className="p-3 flex gap-3">
                      <Clock className="w-4 h-4 text-tertiary flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-on-surface dark:text-white">{item.title}</p>
                        <p className="text-[10px] text-secondary dark:text-gray-500">{item.date} - {item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="p-4 border-t border-surface-container dark:border-white/10 flex flex-col sm:flex-row gap-3 bg-white dark:bg-[#171717]">
              <button onClick={() => updateVerification(selectedBusiness, 'Verified')} className="flex-1 py-3 bg-green-700 hover:bg-green-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Verify Business
              </button>
              <button onClick={() => updateVerification(selectedBusiness, 'Needs Documents')} className="flex-1 py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Request Documents
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}