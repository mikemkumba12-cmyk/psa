import type { AlertNotification, AuditLogEntry, BusinessDocument, BusinessTimelineEvent, Customer, FinancingRequest, LoanApplication, Repayment, SmeBusiness } from '../types';
import type { StoredDocument } from './store';
import { apiRequest, tryApiRequest } from './apiClient';

async function syncMutation(path: string, body: unknown, method = 'POST'): Promise<boolean> {
  const result = await tryApiRequest(path, {
    method,
    body: JSON.stringify(body),
  });
  return result !== null;
}

async function fetchList<T>(path: string): Promise<T | null> {
  return tryApiRequest<T>(path);
}

export interface EnvironmentStatus {
  mode: 'postgres' | 'file' | 'mock';
  label: string;
  detail: string;
  connected: boolean;
  checkedAt?: string;
}

export const platformApi = {
  // ── Core data (v1 routes where available, legacy fallback for others) ─────────
  getApplications: () => fetchList<LoanApplication[]>('/api/applications'),
  getRepayments: () => fetchList<Repayment[]>('/api/repayments'),
  getCustomers: () => fetchList<Customer[]>('/api/v1/customers'),
  getBusinesses: () => fetchList<SmeBusiness[]>('/api/businesses'),
  getBusinessesByCustomerId: (customerId: string) => fetchList<SmeBusiness[]>(`/api/businesses/customer/${encodeURIComponent(customerId)}`),
  getAlerts: () => fetchList<AlertNotification[]>('/api/alerts'),
  getDocumentsForUser: (userId: string) => fetchList<StoredDocument[]>(`/api/documents/${encodeURIComponent(userId)}`),
  getAuditLogs: () => fetchList<AuditLogEntry[]>('/api/audit-logs'),

  createApplication: (application: LoanApplication) =>
    syncMutation('/api/applications', application),

  updateApplication: (id: string, patch: Partial<LoanApplication>) =>
    syncMutation(`/api/applications/${encodeURIComponent(id)}`, patch, 'PATCH'),

  updateRepayment: (id: string, patch: Partial<Repayment>) =>
    syncMutation(`/api/repayments/${encodeURIComponent(id)}`, patch, 'PATCH'),

  createCustomer: (customer: Customer) =>
    syncMutation('/api/customers', customer),

  createBusiness: (business: SmeBusiness) =>
    syncMutation('/api/businesses', business),

  updateBusiness: (id: string, patch: Partial<SmeBusiness>) =>
    syncMutation(`/api/businesses/${encodeURIComponent(id)}`, patch, 'PATCH'),

  createBusinessDocument: (businessId: string, document: BusinessDocument) =>
    syncMutation(`/api/businesses/${encodeURIComponent(businessId)}/documents`, document),

  createBusinessTimelineEvent: (businessId: string, event: BusinessTimelineEvent) =>
    syncMutation(`/api/businesses/${encodeURIComponent(businessId)}/timeline`, event),

  createFinancingRequest: (businessId: string, request: FinancingRequest) =>
    syncMutation(`/api/businesses/${encodeURIComponent(businessId)}/financing-requests`, request),

  createAlert: (alert: AlertNotification) =>
    syncMutation('/api/alerts', alert),

  createDocument: (document: StoredDocument) =>
    syncMutation('/api/documents', document),

  // ✅ Fixed: was a regex literal /api/documents/ — now a correct template string
  updateDocument: (id: string, patch: Partial<StoredDocument>) =>
    syncMutation(`/api/documents/${encodeURIComponent(id)}`, patch, 'PATCH'),

  createAuditLog: (entry: AuditLogEntry) =>
    syncMutation('/api/audit-logs', entry),

  // ── v1 Governance API ──────────────────────────────────────────────────────
  recordGovernanceDecision: (payload: {
    applicationId: string;
    aiRecommendation: string;
    aiConfidence: number;
    aiSignals: string[];
    officerId: string;
    officerDecision: string;
    overrideReason?: string;
  }) => syncMutation('/api/v1/governance/override', payload),

  // ── v1 Scenario Switcher ───────────────────────────────────────────────────
  getActiveScenario: () => tryApiRequest<{ scenario: unknown }>('/api/v1/scenarios/active'),
  switchScenario: (scenario: 'Healthy Portfolio' | 'High Default Risk' | 'Payroll Crisis') =>
    apiRequest<{ success: boolean; scenario: unknown }>('/api/v1/scenarios/switch', {
      method: 'POST', body: JSON.stringify({ scenario }),
    }),

  // ── v1 Intelligence ─────────────────────────────────────────────────────────
  getTopUpOpportunities: () => tryApiRequest<{ opportunities: unknown[] }>('/api/v1/intelligence/top-up-opportunities'),
  getEmployerPredictions: () => tryApiRequest<{ predictions: unknown[] }>('/api/v1/intelligence/employer-predictions'),

  // ── v1 Customer Intelligence (360 Profile) ──────────────────────────────────
  getCustomerIntelligence: (customerId: string) =>
    tryApiRequest<{ customerId: string; relationshipScore: unknown; timeline: unknown[]; ltv: unknown }>(
      `/api/v1/customers/${encodeURIComponent(customerId)}/intelligence`
    ),

  // ── Environment ────────────────────────────────────────────────────────────
  getEnvironmentStatus: async (): Promise<EnvironmentStatus> => {
    const health = await tryApiRequest<{ storageMode?: 'postgres' | 'file'; database?: string; time?: string }>('/api/health');
    if (!health) {
      return {
        mode: 'mock',
        label: 'Mock Mode',
        detail: 'Local demo data, API not configured',
        connected: false,
      };
    }

    const mode = health.storageMode === 'postgres' ? 'postgres' : 'file';
    return {
      mode,
      label: mode === 'postgres' ? 'Postgres Connected' : 'Mock Mode',
      detail: health.database || (mode === 'postgres' ? 'PostgreSQL backend' : 'File-backed demo database'),
      connected: true,
      checkedAt: health.time,
    };
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  getDashboardSummary: () => tryApiRequest<{
    totalDisbursed: number; totalCollected: number; collectionRate: number;
    totalInterestEarned: number; pendingCount: number; activeCount: number;
    totalApplications: number;
    monthlyDisbursements: { name: string; amount: number }[];
    sectorBreakdown: { sector: string; disbursed: number; count: number; pct: number }[];
    recentAuditActivity: unknown[];
  }>('/api/dashboard/summary'),

  // ── Messaging ─────────────────────────────────────────────────────────────
  getConversations: () => tryApiRequest<unknown[]>('/api/conversations'),
  getOrCreateConversation: (staffId: string) =>
    apiRequest<{ id: string; data: unknown }>('/api/conversations', {
      method: 'POST', body: JSON.stringify({ staffId }),
    }),
  getMessages: (convId: string, after?: string) =>
    tryApiRequest<unknown[]>(`/api/conversations/${encodeURIComponent(convId)}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendMessage: (convId: string, content: string) =>
    apiRequest<unknown>(`/api/conversations/${encodeURIComponent(convId)}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    }),
  markRead: (convId: string) =>
    tryApiRequest<void>(`/api/conversations/${encodeURIComponent(convId)}/read`, { method: 'POST' }),

  // ── Staff Management ────────────────────────────────────────────────────────
  getStaffList: () => tryApiRequest<unknown[]>('/api/admin/staff'),
  createStaff: (data: { fullName: string; email: string; password: string; phone?: string; staffTitle?: string }) =>
    apiRequest<unknown>('/api/admin/staff', { method: 'POST', body: JSON.stringify(data) }),
  updateStaff: (id: string, patch: Record<string, unknown>) =>
    apiRequest<unknown>(`/api/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    }),

  // ── Password Change ─────────────────────────────────────────────────────────
  changePassword: (currentPassword: string, newPassword: string) =>
    apiRequest<{ success: boolean; message: string }>('/api/auth/change-password', {
      method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
    }),

  // ── CSV Export ─────────────────────────────────────────────────────────────
  exportReport: (type: 'portfolio' | 'audit' | 'repayments') =>
    `/api/reports/export?type=${type}`,
};


