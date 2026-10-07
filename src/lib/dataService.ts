import { platformApi } from './platformApi';
import { hasApiBackend } from './apiClient';
import {
  applicationsStore,
  repaymentsStore,
  chatsStore,
  alertsStore,
  customersStore,
  businessesStore,
  documentsStore,
  auditStore,
  type StoredDocument,
} from './store';
import type {
  AlertNotification,
  AuditLogEntry,
  ChatConversation,
  Customer,
  LoanApplication,
  Repayment,
  SmeBusiness,
} from '../types';

function fallback<T>(backendResult: T | null, localFallback: () => T, syncLocal?: (value: T) => void): T {
  if (!hasApiBackend()) return localFallback();
  if (backendResult !== null) {
    syncLocal?.(backendResult);
    return backendResult;
  }
  return localFallback();
}

function extractArray<T>(data: any): T[] | null {
  if (!data) return null;
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    // Common API response wrapper keys — add any new ones here
    for (const key of ['customers', 'applications', 'loans', 'repayments', 'businesses', 'alerts', 'documents', 'logs', 'auditLogs', 'records', 'items', 'data']) {
      if (Array.isArray(data[key])) return data[key];
    }
  }
  return null;
}

function fallbackList<T>(
  backendResult: any,
  localFallback: () => T[],
  syncLocal?: (value: T[]) => void,
  filter?: (item: T) => boolean
): T[] {
  if (!hasApiBackend()) return localFallback();
  const extracted = extractArray<T>(backendResult);
  if (extracted !== null) {
    syncLocal?.(extracted);
    return filter ? extracted.filter(filter) : extracted;
  }
  return localFallback();
}

function businessBelongsToUser(business: SmeBusiness, userId: string): boolean {
  return business.customerId === userId || business.customerId === `cust-${userId}`;
}

export async function loadApplications(userId?: string): Promise<LoanApplication[]> {
  const backend = await platformApi.getApplications();
  return fallbackList(
    backend,
    () => applicationsStore.getAll(userId),
    applicationsStore.save,
    userId ? application => application.userId === userId : undefined
  );
}

export async function loadRepayments(userId?: string): Promise<Repayment[]> {
  const backend = await platformApi.getRepayments();
  return fallbackList(
    backend,
    () => repaymentsStore.getAll(userId),
    repaymentsStore.save,
    userId ? repayment => repayment.userId === userId : undefined
  );
}

export async function loadChats(): Promise<ChatConversation[]> {
  return fallback(null, chatsStore.getAll);
}

export async function loadAlerts(userId?: string): Promise<AlertNotification[]> {
  const backend = await platformApi.getAlerts();
  return fallbackList(
    backend,
    () => alertsStore.getAll(userId),
    alertsStore.save,
    userId ? alert => !alert.userId || alert.userId === userId : undefined
  );
}

export async function loadCustomers(): Promise<Customer[]> {
  const backend = await platformApi.getCustomers();
  return fallbackList(backend, customersStore.getAll, customersStore.save);
}

export async function loadBusinesses(userId?: string): Promise<SmeBusiness[]> {
  const backend = await platformApi.getBusinesses();
  return fallbackList(
    backend,
    () => businessesStore.getAll(userId),
    businessesStore.save,
    userId ? business => businessBelongsToUser(business, userId) : undefined
  );
}

export async function loadBusinessesForCustomer(customerId: string): Promise<SmeBusiness[]> {
  const loaded = await platformApi.getBusinessesByCustomerId(customerId);
  return fallbackList(loaded, () => {
    const all = businessesStore.getAll();
    return all.filter(business => businessBelongsToUser(business, customerId));
  });
}

export async function loadDocumentsForUser(userId: string): Promise<StoredDocument[]> {
  const loaded = await platformApi.getDocumentsForUser(userId);
  return fallbackList(loaded, () => documentsStore.getForUser(userId));
}

export async function loadAuditLogs(): Promise<AuditLogEntry[]> {
  const loaded = await platformApi.getAuditLogs();
  return fallbackList(loaded, auditStore.getAll);
}

