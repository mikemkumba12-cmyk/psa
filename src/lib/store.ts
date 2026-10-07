/**
 * Pinnacle Smart Advisor — localStorage store abstraction.
 * Swap the read/write calls here to migrate to a real backend.
 */

import { initialLoanApplications, initialRepayments, initialChats, initialAlertNotifications, initialCustomers, initialSmeBusinesses } from '../data';
import type { LoanApplication, Repayment, ChatConversation, AlertNotification, Customer, AuditLogEntry, SmeBusiness, BusinessDocument, BusinessTimelineEvent, FinancingRequest, PayrollRecord, PayrollBatch } from '../types';

const KEYS = {
  SEEDED: 'psa_seeded',
  APPLICATIONS: 'psa_applications',
  REPAYMENTS: 'psa_repayments',
  CHATS: 'psa_chats',
  ALERTS: 'psa_alerts',
  CUSTOMERS: 'psa_customers',
  BUSINESSES: 'psa_sme_businesses',
  DOCUMENTS: 'psa_documents',
  AUDIT: 'psa_audit_logs',
  THEME: 'psa_theme',
  PAYROLL_RECORDS: 'psa_payroll_records',
  PAYROLL_BATCHES: 'psa_payroll_batches',
  EXTRACTIONS: 'psa_extractions',
} as const;

// ── Generic helpers ──────────────────────────────────────────────────────────
function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function setJSON<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Seed on first run ────────────────────────────────────────────────────────
export function seedIfNeeded(): void {
  if (localStorage.getItem(KEYS.SEEDED)) return;
  setJSON(KEYS.APPLICATIONS, initialLoanApplications);
  setJSON(KEYS.REPAYMENTS, initialRepayments);
  setJSON(KEYS.CHATS, initialChats);
  setJSON(KEYS.ALERTS, initialAlertNotifications);
  setJSON(KEYS.CUSTOMERS, initialCustomers);
  setJSON(KEYS.BUSINESSES, initialSmeBusinesses);
  setJSON<AuditLogEntry[]>(KEYS.AUDIT, [{
    id: 'audit-seed-001',
    occurredAt: new Date().toISOString(),
    actorId: 'system',
    actorName: 'Pinnacle Platform',
    actorRole: 'system',
    action: 'system.seed_demo_data',
    entityType: 'system',
    outcome: 'success',
    summary: 'Initial demo data seeded for the digital lending prototype.',
  }]);
  localStorage.setItem(KEYS.SEEDED, '1');
}

// ── Applications ─────────────────────────────────────────────────────────────
export const applicationsStore = {
  getAllUnfiltered: (): LoanApplication[] => getJSON(KEYS.APPLICATIONS, initialLoanApplications),
  getAll: (userId?: string): LoanApplication[] => {
    const all = getJSON(KEYS.APPLICATIONS, initialLoanApplications);
    return userId ? all.filter(a => a.userId === userId) : all;
  },
  save: (apps: LoanApplication[]): void => setJSON(KEYS.APPLICATIONS, apps),
  add: (app: LoanApplication): void => {
    const current = applicationsStore.getAllUnfiltered();
    setJSON(KEYS.APPLICATIONS, [app, ...current]);
  },
  update: (id: string, patch: Partial<LoanApplication>): void => {
    const current = applicationsStore.getAllUnfiltered().map(a => a.id === id ? { ...a, ...patch } : a);
    setJSON(KEYS.APPLICATIONS, current);
  },
};

// ── Repayments ────────────────────────────────────────────────────────────────
export const repaymentsStore = {
  getAllUnfiltered: (): Repayment[] => getJSON(KEYS.REPAYMENTS, initialRepayments),
  getAll: (userId?: string): Repayment[] => {
    const all = getJSON(KEYS.REPAYMENTS, initialRepayments);
    return userId ? all.filter(r => r.userId === userId) : all;
  },
  save: (reps: Repayment[]): void => setJSON(KEYS.REPAYMENTS, reps),
  add: (repayment: Repayment): void => {
    const current = repaymentsStore.getAllUnfiltered();
    setJSON(KEYS.REPAYMENTS, [...current, repayment]);
  },
  addMultiple: (repayments: Repayment[]): void => {
    const current = repaymentsStore.getAllUnfiltered();
    setJSON(KEYS.REPAYMENTS, [...current, ...repayments]);
  },
  update: (id: string, patch: Partial<Repayment>): void => {
    const current = repaymentsStore.getAllUnfiltered().map(r => r.id === id ? { ...r, ...patch } : r);
    setJSON(KEYS.REPAYMENTS, current);
  },
  upsert: (repayment: Repayment): void => {
    const current = repaymentsStore.getAllUnfiltered();
    const exists = current.some(r => r.id === repayment.id);
    if (exists) {
      setJSON(KEYS.REPAYMENTS, current.map(r => r.id === repayment.id ? { ...r, ...repayment } : r));
    } else {
      setJSON(KEYS.REPAYMENTS, [...current, repayment]);
    }
  },
};

// ── Chats ────────────────────────────────────────────────────────────────────
export const chatsStore = {
  getAll: (): ChatConversation[] => getJSON(KEYS.CHATS, initialChats),
  save: (chats: ChatConversation[]): void => setJSON(KEYS.CHATS, chats),
  clearUnread: (chatId: string): void => {
    const current = chatsStore.getAll().map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c);
    setJSON(KEYS.CHATS, current);
  },
};

// ── Alerts ───────────────────────────────────────────────────────────────────
export const alertsStore = {
  getAllUnfiltered: (): AlertNotification[] => getJSON(KEYS.ALERTS, initialAlertNotifications),
  getAll: (userId?: string): AlertNotification[] => {
    const all = getJSON(KEYS.ALERTS, initialAlertNotifications);
    // Return system alerts (no userId) + user-specific alerts
    return userId ? all.filter(a => !a.userId || a.userId === userId) : all;
  },
  save: (alerts: AlertNotification[]): void => setJSON(KEYS.ALERTS, alerts),
  add: (alert: AlertNotification): void => {
    const current = alertsStore.getAllUnfiltered();
    setJSON(KEYS.ALERTS, [alert, ...current]);
  },
};

// ── Customers ────────────────────────────────────────────────────────────────
export const customersStore = {
  getAll: (): Customer[] => {
    const list = getJSON(KEYS.CUSTOMERS, initialCustomers);
    let modified = false;
    const migrated = list.map(c => {
      const match = initialCustomers.find(ic => ic.id === c.id);
      if (match && (!c.employeeNumber || !c.nationalId)) {
        modified = true;
        return {
          ...c,
          employeeNumber: c.employeeNumber || match.employeeNumber,
          nationalId: c.nationalId || match.nationalId,
        };
      }
      return c;
    });
    if (modified) {
      setJSON(KEYS.CUSTOMERS, migrated);
    }
    return migrated;
  },
  save: (customers: Customer[]): void => setJSON(KEYS.CUSTOMERS, customers),
  add: (customer: Customer): void => {
    const current = customersStore.getAll();
    setJSON(KEYS.CUSTOMERS, [customer, ...current]);
  },
  update: (id: string, patch: Partial<Customer>): void => {
    const current = customersStore.getAll().map(customer =>
      customer.id === id ? { ...customer, ...patch } : customer
    );
    setJSON(KEYS.CUSTOMERS, current);
  },
};

// ── SME Businesses ───────────────────────────────────────────────────────────
export const businessesStore = {
  getAllUnfiltered: (): SmeBusiness[] => getJSON(KEYS.BUSINESSES, initialSmeBusinesses),
  getAll: (userId?: string): SmeBusiness[] => {
    const all = getJSON(KEYS.BUSINESSES, initialSmeBusinesses);
    return userId ? all.filter(b => b.customerId === `cust-${userId}` || b.customerId === userId) : all;
  },
  save: (businesses: SmeBusiness[]): void => setJSON(KEYS.BUSINESSES, businesses),
  add: (business: SmeBusiness): void => {
    const current = businessesStore.getAllUnfiltered();
    setJSON(KEYS.BUSINESSES, [business, ...current.filter(item => item.id !== business.id)]);
  },
  update: (id: string, patch: Partial<SmeBusiness>): void => {
    const current = businessesStore.getAllUnfiltered().map(item => item.id === id ? { ...item, ...patch } : item);
    setJSON(KEYS.BUSINESSES, current);
  },
  addDocument: (businessId: string, document: BusinessDocument): void => {
    const current = businessesStore.getAllUnfiltered().map(item => item.id === businessId
      ? { ...item, documents: [document, ...item.documents.filter(doc => doc.id !== document.id)] }
      : item);
    setJSON(KEYS.BUSINESSES, current);
  },
  addTimelineEvent: (businessId: string, event: BusinessTimelineEvent): void => {
    const current = businessesStore.getAllUnfiltered().map(item => item.id === businessId
      ? { ...item, timeline: [event, ...item.timeline.filter(existing => existing.id !== event.id)] }
      : item);
    setJSON(KEYS.BUSINESSES, current);
  },
  addFinancingRequest: (businessId: string, request: FinancingRequest): void => {
    const current = businessesStore.getAllUnfiltered().map(item => item.id === businessId
      ? { ...item, financingRequests: [request, ...item.financingRequests.filter(existing => existing.id !== request.id)] }
      : item);
    setJSON(KEYS.BUSINESSES, current);
  },
};

// ── Documents ────────────────────────────────────────────────────────────────
export interface StoredDocument {
  id: string;
  userId: string;
  name: string;
  type?: string;
  size?: number;
  base64?: string;
  filePath?: string;
  uploadedAt: string;
  category: string;
}

export const documentsStore = {
  getAll: (): StoredDocument[] => getJSON<StoredDocument[]>(KEYS.DOCUMENTS, []),
  getForUser: (userId: string): StoredDocument[] =>
    getJSON<StoredDocument[]>(KEYS.DOCUMENTS, []).filter(d => d.userId === userId),
  add: (doc: StoredDocument): void => {
    const current = getJSON<StoredDocument[]>(KEYS.DOCUMENTS, []);
    setJSON(KEYS.DOCUMENTS, [...current, doc]);
  },
  update: (id: string, patch: Partial<StoredDocument>): void => {
    const current = getJSON<StoredDocument[]>(KEYS.DOCUMENTS, []).map(d => d.id === id ? { ...d, ...patch } : d);
    setJSON(KEYS.DOCUMENTS, current);
  },
};

// ── Document Extractions ──────────────────────────────────────────────────────
import type { DocumentExtraction } from '../types';

export const extractionsStore = {
  getAll: (): DocumentExtraction[] => getJSON<DocumentExtraction[]>(KEYS.EXTRACTIONS, []),
  getForDoc: (documentId: string): DocumentExtraction | undefined =>
    getJSON<DocumentExtraction[]>(KEYS.EXTRACTIONS, []).find(e => e.documentId === documentId),
  getForApp: (applicationId: string): DocumentExtraction[] =>
    getJSON<DocumentExtraction[]>(KEYS.EXTRACTIONS, []).filter(e => e.applicationId === applicationId),
  addOrUpdate: (extraction: DocumentExtraction): void => {
    const current = getJSON<DocumentExtraction[]>(KEYS.EXTRACTIONS, []);
    const idx = current.findIndex(e => e.documentId === extraction.documentId);
    if (idx >= 0) {
      current[idx] = extraction;
      setJSON(KEYS.EXTRACTIONS, current);
    } else {
      setJSON(KEYS.EXTRACTIONS, [...current, extraction]);
    }
  },
};

// ── Audit Logs ──────────────────────────────────────────────────────────────
export const auditStore = {
  getAll: (): AuditLogEntry[] => getJSON(KEYS.AUDIT, []),
  add: (entry: AuditLogEntry): void => {
    const current = auditStore.getAll();
    setJSON(KEYS.AUDIT, [entry, ...current].slice(0, 250));
  },
};

// ── Payroll ──────────────────────────────────────────────────────────────────
export const payrollStore = {
  getAllRecords: (): PayrollRecord[] => getJSON<PayrollRecord[]>(KEYS.PAYROLL_RECORDS, []),
  getAllBatches: (): PayrollBatch[] => getJSON<PayrollBatch[]>(KEYS.PAYROLL_BATCHES, []),
  addBatch: (batch: PayrollBatch): void => {
    const current = getJSON<PayrollBatch[]>(KEYS.PAYROLL_BATCHES, []);
    // Prevent duplicate uploads: same fileName + same month is a duplicate
    const duplicate = current.find(
      b => b.fileName === batch.fileName && b.month === batch.month
    );
    if (duplicate) {
      throw new Error(
        `DUPLICATE_BATCH: "${batch.fileName}" for ${batch.month} has already been uploaded (Batch ID: ${duplicate.id}). Please verify the correct file before re-uploading.`
      );
    }
    setJSON(KEYS.PAYROLL_BATCHES, [batch, ...current]);
  },
  addRecords: (records: PayrollRecord[]): void => {
    const current = getJSON<PayrollRecord[]>(KEYS.PAYROLL_RECORDS, []);
    setJSON(KEYS.PAYROLL_RECORDS, [...records, ...current]);
  },
  updateRecord: (id: string, patch: Partial<PayrollRecord>): void => {
    const current = getJSON<PayrollRecord[]>(KEYS.PAYROLL_RECORDS, []).map(r => r.id === id ? { ...r, ...patch } : r);
    setJSON(KEYS.PAYROLL_RECORDS, current);
  },
  updateBatch: (id: string, patch: Partial<PayrollBatch>): void => {
    const current = getJSON<PayrollBatch[]>(KEYS.PAYROLL_BATCHES, []).map(b => b.id === id ? { ...b, ...patch } : b);
    setJSON(KEYS.PAYROLL_BATCHES, current);
  },
};

// ── Theme ────────────────────────────────────────────────────────────────────
export const themeStore = {
  get: (): 'light' | 'dark' => {
    const saved = localStorage.getItem(KEYS.THEME) as 'light' | 'dark' | null;
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },
  set: (theme: 'light' | 'dark'): void => {
    localStorage.setItem(KEYS.THEME, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  },
  init: (): void => {
    const theme = themeStore.get();
    document.documentElement.classList.toggle('dark', theme === 'dark');
  },
};

