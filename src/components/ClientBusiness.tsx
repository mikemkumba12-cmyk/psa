import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ShieldCheck, ChevronRight, Flame, Zap, UploadCloud, FileText, CheckCircle2,
  Info, Plus, Building2, Users, Clock, X, Link2, Briefcase, Activity,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { businessesStore } from '../lib/store';
import { platformApi } from '../lib/platformApi';
import { loadBusinessesForCustomer } from '../lib/dataService';
import { recordAuditEvent } from '../lib/auditTrail';
import type { BusinessDocument, BusinessTimelineEvent, FinancingRequest, SmeBusiness } from '../types';

interface ClientBusinessProps {
  onApplyOpportunity: (productName: string, maxAmount: number) => void;
}

const DOCUMENT_CATEGORIES: BusinessDocument['category'][] = ['Registration', 'Tax', 'Bank Statement', 'Financials', 'Permit', 'Other'];

const financingProducts = [
  {
    name: 'Inventory Bridge',
    maxAmount: 5000000,
    termMonths: 6,
    purpose: 'Fast capital for high-season stock procurement.',
    Icon: Flame,
    accent: 'bg-primary',
  },
  {
    name: 'Equipment Finance',
    maxAmount: 10000000,
    termMonths: 24,
    purpose: 'Upgrade tools, vehicles, or productive equipment.',
    Icon: Zap,
    accent: 'bg-tertiary',
  },
];

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatMoney(value: number): string {
  return `MWK ${value.toLocaleString()}`;
}

function statusClass(status: SmeBusiness['verificationStatus']): string {
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

function documentStatusClass(status: BusinessDocument['status']): string {
  if (status === 'Verified') return 'text-green-700 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-500/10 dark:border-green-500/20';
  if (status === 'Rejected') return 'text-red-700 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-500/10 dark:border-red-500/20';
  return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-500/10 dark:border-amber-500/20';
}

export default function ClientBusiness({ onApplyOpportunity }: ClientBusinessProps) {
  const { session } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [businesses, setBusinesses] = useState(() => businessesStore.getAll());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [documentCategory, setDocumentCategory] = useState<BusinessDocument['category']>('Bank Statement');
  const [form, setForm] = useState({
    name: '',
    registrationNumber: '',
    sector: 'Retail',
    industryCategory: 'General Trading',
    location: 'Lilongwe',
    monthlyRevenue: '1200000',
    employees: '3',
    yearsInBusiness: '1',
  });

  const customerBusinesses = useMemo(() => {
    const sessionName = session?.fullName?.toLowerCase() || '';
    const directMatches = businesses.filter(b =>
      b.customerId === session?.userId || b.customerName.toLowerCase() === sessionName
    );
    if (directMatches.length > 0) return directMatches;

    const demoMatches = businesses.filter(b => b.customerName === 'John Doe');
    return demoMatches.length > 0 ? demoMatches : businesses.slice(0, 1);
  }, [businesses, session]);

  const activeBusiness = customerBusinesses.find(b => b.id === selectedId) || customerBusinesses[0];

  useEffect(() => {
    if (!session?.userId) return;
    let active = true;

    (async () => {
      const loaded = await loadBusinessesForCustomer(session.userId);
      if (!active) return;
      setBusinesses(loaded);
      if (loaded.length > 0 && !loaded.some(item => item.id === selectedId)) {
        setSelectedId(loaded[0].id);
      }
    })();

    return () => {
      active = false;
    };
  }, [session?.userId, selectedId]);

  const refreshBusinesses = () => setBusinesses(businessesStore.getAll());

  const addTimelineEvent = (businessId: string, event: BusinessTimelineEvent) => {
    businessesStore.addTimelineEvent(businessId, event);
    void platformApi.createBusinessTimelineEvent(businessId, event);
  };

  const handleCreateBusiness = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    const businessId = makeId('biz');
    const monthlyRevenue = Number(form.monthlyRevenue) || 0;
    const now = new Date();
    const timelineEvent: BusinessTimelineEvent = {
      id: makeId('biz-tl'),
      businessId,
      date: now.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }),
      title: 'Business profile created',
      detail: 'SME entity registered and linked to the customer profile.',
      type: 'registration',
    };

    const business: SmeBusiness = {
      id: businessId,
      customerId: session?.userId || 'client-demo-john',
      customerName: session?.fullName || 'John Doe',
      name: form.name.trim(),
      registrationNumber: form.registrationNumber.trim() || `PENDING-${businessId.slice(-5).toUpperCase()}`,
      sector: form.sector,
      industryCategory: form.industryCategory.trim() || form.sector,
      location: form.location,
      verificationStatus: 'Pending Verification',
      relationshipManager: 'Unassigned',
      riskLevel: monthlyRevenue >= 3000000 ? 'Low' : monthlyRevenue >= 1000000 ? 'Medium' : 'High',
      annualRevenue: monthlyRevenue * 12,
      monthlyRevenue,
      employees: Number(form.employees) || 1,
      yearsInBusiness: Number(form.yearsInBusiness) || 0,
      healthScore: monthlyRevenue >= 3000000 ? 76 : monthlyRevenue >= 1000000 ? 64 : 52,
      owners: [{
        customerId: session?.userId || 'client-demo-john',
        customerName: session?.fullName || 'John Doe',
        role: 'Primary Owner',
        ownershipPct: 100,
        linkedAt: now.toISOString().slice(0, 10),
      }],
      documents: [],
      timeline: [timelineEvent],
      financingRequests: [],
    };

    businessesStore.add(business);
    void platformApi.createBusiness(business);
    recordAuditEvent({
      actorId: session?.userId || 'client-local',
      actorName: session?.fullName || 'Client User',
      actorRole: 'client',
      action: 'sme_business.create',
      entityType: 'sme_business',
      entityId: business.id,
      outcome: 'success',
      summary: `Client registered SME business ${business.name}.`,
      metadata: { sector: business.sector, verificationStatus: business.verificationStatus },
    });

    setSelectedId(business.id);
    setShowAddForm(false);
    setForm(prev => ({ ...prev, name: '', registrationNumber: '' }));
    refreshBusinesses();
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !activeBusiness) return;

    const document: BusinessDocument = {
      id: makeId('biz-doc'),
      businessId: activeBusiness.id,
      name: file.name,
      category: documentCategory,
      status: 'Uploaded',
      uploadedAt: new Date().toISOString(),
      size: file.size,
    };
    const timelineEvent: BusinessTimelineEvent = {
      id: makeId('biz-tl'),
      businessId: activeBusiness.id,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }),
      title: `${documentCategory} document uploaded`,
      detail: `${file.name} added to the SME document vault.`,
      type: 'document',
    };

    businessesStore.addDocument(activeBusiness.id, document);
    void platformApi.createBusinessDocument(activeBusiness.id, document);
    addTimelineEvent(activeBusiness.id, timelineEvent);
    recordAuditEvent({
      actorId: session?.userId || 'client-local',
      actorName: session?.fullName || 'Client User',
      actorRole: 'client',
      action: 'sme_business.document_upload',
      entityType: 'business_document',
      entityId: document.id,
      outcome: 'success',
      summary: `Client uploaded ${documentCategory} document for ${activeBusiness.name}.`,
      metadata: { businessId: activeBusiness.id, category: documentCategory, fileName: file.name, size: file.size },
    });

    event.target.value = '';
    refreshBusinesses();
  };

  const submitFinancingRequest = (productName: string, maxAmount: number, termMonths: number, purpose: string) => {
    if (!activeBusiness) return;

    const amount = Math.min(maxAmount, Math.max(250000, Math.round(activeBusiness.monthlyRevenue * 1.5)));
    const request: FinancingRequest = {
      id: makeId('fin'),
      businessId: activeBusiness.id,
      productName,
      amount,
      termMonths,
      purpose,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
    };
    const timelineEvent: BusinessTimelineEvent = {
      id: makeId('biz-tl'),
      businessId: activeBusiness.id,
      date: new Date().toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' }),
      title: `${productName} request submitted`,
      detail: `${formatMoney(amount)} requested over ${termMonths} months.`,
      type: 'financing',
    };

    businessesStore.addFinancingRequest(activeBusiness.id, request);
    void platformApi.createFinancingRequest(activeBusiness.id, request);
    addTimelineEvent(activeBusiness.id, timelineEvent);
    recordAuditEvent({
      actorId: session?.userId || 'client-local',
      actorName: session?.fullName || 'Client User',
      actorRole: 'client',
      action: 'sme_business.financing_request',
      entityType: 'financing_request',
      entityId: request.id,
      outcome: 'success',
      summary: `Client requested ${productName} for ${activeBusiness.name}.`,
      metadata: { businessId: activeBusiness.id, amount, termMonths },
    });

    refreshBusinesses();
    onApplyOpportunity(productName, maxAmount);
  };

  if (!activeBusiness) {
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-on-surface dark:text-white">Business Profile</h1>
          <p className="text-sm text-secondary dark:text-gray-400">Register an SME entity to begin business services.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-primary-container text-white px-4 py-3 rounded-xl text-xs font-bold flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Register Business
        </button>
      </div>
    );
  }

  const verifiedDocs = activeBusiness.documents.filter(doc => doc.status === 'Verified').length;
  const latestRequest = activeBusiness.financingRequests[0];

  return (
    <div className="space-y-6">
      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleFileUpload} />

      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-on-surface dark:text-white">SME Workspace</h1>
          <p className="text-sm text-secondary dark:text-gray-400">Business profiles, documents, ownership, and financing requests.</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="bg-primary text-white font-semibold text-xs py-2.5 px-4 rounded-xl flex items-center gap-1.5 active:scale-95 transition-transform shadow-sm w-fit"
        >
          <Plus className="w-4 h-4" /> Register Business
        </button>
      </div>

      {customerBusinesses.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {customerBusinesses.map(business => (
            <button
              key={business.id}
              onClick={() => setSelectedId(business.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-xl border text-xs font-bold transition-all ${
                business.id === activeBusiness.id
                  ? 'border-primary bg-primary/10 text-primary dark:bg-orange-500/10 dark:text-orange-400'
                  : 'border-outline-variant bg-white text-secondary hover:bg-surface-container-low dark:bg-white/[0.04] dark:border-white/10 dark:text-gray-400'
              }`}
            >
              {business.name}
            </button>
          ))}
        </div>
      )}

      <section className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 p-6 rounded-2xl shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Active Entity</p>
              <h2 className="text-xl font-bold text-on-surface dark:text-white truncate">{activeBusiness.name}</h2>
              <p className="text-sm text-secondary dark:text-gray-400 font-medium">{activeBusiness.industryCategory} - {activeBusiness.location}, Malawi</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`border px-3 py-1 rounded-full text-[11px] font-bold ${statusClass(activeBusiness.verificationStatus)}`}>
              {activeBusiness.verificationStatus}
            </span>
            <span className={`border px-3 py-1 rounded-full text-[11px] font-bold ${riskClass(activeBusiness.riskLevel)}`}>
              {activeBusiness.riskLevel} Risk
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-4 border-t border-surface-container dark:border-white/10">
          <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
            <p className="text-[9px] text-secondary dark:text-gray-500 uppercase font-bold">Monthly Revenue</p>
            <p className="text-sm font-black text-on-surface dark:text-white mt-1">{formatMoney(activeBusiness.monthlyRevenue)}</p>
          </div>
          <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
            <p className="text-[9px] text-secondary dark:text-gray-500 uppercase font-bold">Employees</p>
            <p className="text-sm font-black text-on-surface dark:text-white mt-1">{activeBusiness.employees}</p>
          </div>
          <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
            <p className="text-[9px] text-secondary dark:text-gray-500 uppercase font-bold">Business Age</p>
            <p className="text-sm font-black text-on-surface dark:text-white mt-1">{activeBusiness.yearsInBusiness} yrs</p>
          </div>
          <div className="bg-surface-container-low dark:bg-white/[0.03] p-3 rounded-xl border border-outline-variant/30 dark:border-white/10">
            <p className="text-[9px] text-secondary dark:text-gray-500 uppercase font-bold">Health Score</p>
            <p className="text-sm font-black text-primary mt-1">{activeBusiness.healthScore}/100</p>
          </div>
        </div>

        <div className="bg-[#00abf3]/5 border border-[#00abf3]/25 p-4 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-tertiary flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#003c58] dark:text-blue-200 leading-relaxed">
            {activeBusiness.verificationStatus === 'Verified'
              ? 'This business is verified and eligible for SME financing recommendations.'
              : 'Complete business document uploads to speed up SME verification and credit review.'}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-[11px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Financing Opportunities</h3>
            {latestRequest && <span className="text-[10px] font-bold text-primary">Latest: {latestRequest.status}</span>}
          </div>

          <div className="space-y-4">
            {financingProducts.map(({ name, maxAmount, termMonths, purpose, Icon, accent }) => (
              <div key={name} className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl overflow-hidden flex shadow-sm">
                <div className={`w-2 ${accent}`} />
                <div className="p-4 flex-1 space-y-3">
                  <div className="flex justify-between items-start gap-3">
                    <div>
                      <h4 className="font-bold text-base text-on-surface dark:text-white">{name}</h4>
                      <p className="text-xs text-secondary dark:text-gray-400 mt-0.5">{purpose}</p>
                    </div>
                    <Icon className="text-primary-container w-5 h-5 flex-shrink-0" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <p className="text-[10px] text-secondary dark:text-gray-500 font-medium uppercase tracking-wider">Up to</p>
                      <p className="text-sm font-bold text-on-surface dark:text-white">{formatMoney(maxAmount)}</p>
                    </div>
                    <button
                      onClick={() => submitFinancingRequest(name, maxAmount, termMonths, purpose)}
                      className="bg-primary text-white px-5 py-2 rounded-xl text-xs font-semibold shadow-sm active:scale-95 transition-transform hover:brightness-105"
                    >
                      Request
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Ownership Links</h3>
          <div className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container dark:divide-white/10">
            {activeBusiness.owners.map(owner => (
              <div key={`${owner.customerId}-${owner.role}`} className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Users className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface dark:text-white truncate">{owner.customerName}</p>
                    <p className="text-[10px] text-secondary dark:text-gray-500">{owner.role}</p>
                  </div>
                </div>
                <span className="text-xs font-black text-primary">{owner.ownershipPct}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Business Documents</h3>
              <p className="text-[10px] text-secondary dark:text-gray-500">{verifiedDocs}/{activeBusiness.documents.length || 0} verified documents</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={documentCategory}
                onChange={(event) => setDocumentCategory(event.target.value as BusinessDocument['category'])}
                className="h-9 bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-xl px-2 text-[10px] font-bold text-secondary dark:text-gray-300"
              >
                {DOCUMENT_CATEGORIES.map(category => <option key={category} value={category}>{category}</option>)}
              </select>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-9 bg-primary-container text-white px-3 rounded-xl text-[11px] font-bold flex items-center gap-1.5"
              >
                <UploadCloud className="w-3.5 h-3.5" /> Upload
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container dark:divide-white/10">
            {activeBusiness.documents.length === 0 ? (
              <div className="p-6 text-center">
                <FileText className="w-8 h-8 mx-auto text-secondary dark:text-gray-500 mb-2" />
                <p className="text-xs font-bold text-secondary dark:text-gray-400">No business documents uploaded yet.</p>
              </div>
            ) : activeBusiness.documents.map(doc => (
              <div key={doc.id} className="p-4 flex items-center justify-between gap-3 hover:bg-surface-container-low dark:hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high dark:bg-white/10 flex items-center justify-center text-secondary">
                    <FileText className="w-5 h-5 text-secondary dark:text-gray-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-on-surface dark:text-white truncate">{doc.name}</p>
                    <p className="text-[10px] text-secondary dark:text-gray-500">{doc.category} - {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString() : 'Pending'}</p>
                  </div>
                </div>
                <span className={`border px-2 py-0.5 rounded-full text-[9px] font-bold ${documentStatusClass(doc.status)}`}>
                  {doc.status}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[11px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Business Timeline</h3>
          <div className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container dark:divide-white/10">
            {activeBusiness.timeline.map(item => (
              <div key={item.id} className="p-4 flex gap-3">
                <div className="w-9 h-9 rounded-xl bg-tertiary/10 flex items-center justify-center flex-shrink-0">
                  {item.type === 'financing' ? <Briefcase className="w-4 h-4 text-tertiary" /> : item.type === 'relationship' ? <Link2 className="w-4 h-4 text-tertiary" /> : <Clock className="w-4 h-4 text-tertiary" />}
                </div>
                <div>
                  <p className="text-xs font-bold text-on-surface dark:text-white">{item.title}</p>
                  <p className="text-[10px] text-secondary dark:text-gray-500 mt-0.5">{item.date}</p>
                  <p className="text-[11px] text-secondary dark:text-gray-400 mt-1 leading-relaxed">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="space-y-3 pb-6">
        <h3 className="text-[11px] font-bold text-secondary dark:text-gray-500 uppercase tracking-widest">Financing Request History</h3>
        <div className="bg-white dark:bg-white/[0.04] border border-outline-variant dark:border-white/10 rounded-2xl overflow-hidden shadow-sm divide-y divide-surface-container dark:divide-white/10">
          {activeBusiness.financingRequests.length === 0 ? (
            <div className="p-5 flex items-center gap-3 text-secondary dark:text-gray-400">
              <Activity className="w-5 h-5" />
              <p className="text-xs font-bold">No financing requests submitted for this business.</p>
            </div>
          ) : activeBusiness.financingRequests.map(request => (
            <div key={request.id} className="p-4 flex items-center justify-between gap-4 hover:bg-surface-container-low dark:hover:bg-white/[0.03] transition-colors">
              <div className="min-w-0">
                <p className="text-xs font-bold text-on-surface dark:text-white">{request.productName}</p>
                <p className="text-[10px] text-secondary dark:text-gray-500">{formatMoney(request.amount)} over {request.termMonths} months</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-bold text-primary">{request.status}</span>
                <ChevronRight className="w-4 h-4 text-secondary" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {showAddForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form onSubmit={handleCreateBusiness} className="bg-white dark:bg-[#171717] border border-outline-variant dark:border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in">
            <div className="p-5 border-b border-surface-container dark:border-white/10 flex justify-between items-center bg-surface-container-low dark:bg-white/[0.03]">
              <div>
                <p className="text-[10px] text-secondary dark:text-gray-500 uppercase tracking-widest font-bold">SME Registration</p>
                <h3 className="text-base font-bold text-on-surface dark:text-white">Register Business Entity</h3>
              </div>
              <button type="button" onClick={() => setShowAddForm(false)} className="p-1.5 hover:bg-surface-container rounded-lg text-secondary">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2 space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Business Name</label>
                  <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" placeholder="e.g. Bright Horizon Solar" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Registration No.</label>
                  <input value={form.registrationNumber} onChange={e => setForm({ ...form, registrationNumber: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" placeholder="MBRS-BZ-00000" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Sector</label>
                  <select value={form.sector} onChange={e => setForm({ ...form, sector: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-bold text-secondary dark:text-gray-300">
                    {['Agriculture', 'Retail', 'Transport', 'Manufacturing', 'Sustainable Energy', 'Logistics', 'Services'].map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Industry Category</label>
                  <input value={form.industryCategory} onChange={e => setForm({ ...form, industryCategory: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Branch Location</label>
                  <select value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-bold text-secondary dark:text-gray-300">
                    {['Lilongwe', 'Blantyre', 'Zomba', 'Mzuzu'].map(item => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Monthly Revenue</label>
                  <input type="number" min="0" value={form.monthlyRevenue} onChange={e => setForm({ ...form, monthlyRevenue: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Employees</label>
                  <input type="number" min="1" value={form.employees} onChange={e => setForm({ ...form, employees: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-secondary dark:text-gray-500 uppercase tracking-wider block">Years In Business</label>
                  <input type="number" min="0" step="0.1" value={form.yearsInBusiness} onChange={e => setForm({ ...form, yearsInBusiness: e.target.value })} className="w-full h-11 border border-outline-variant/60 dark:border-white/10 dark:bg-white/[0.04] rounded-xl px-3 text-xs font-semibold" />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 bg-primary-container text-white font-bold text-xs rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Register & Link Business
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}