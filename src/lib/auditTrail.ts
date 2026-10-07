import type { AuditLogEntry } from '../types';
import { auditStore } from './store';
import { platformApi } from './platformApi';

type AuditInput = Omit<AuditLogEntry, 'id' | 'occurredAt'>;

function createAuditId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function recordAuditEvent(input: AuditInput): AuditLogEntry {
  const entry: AuditLogEntry = {
    id: createAuditId(),
    occurredAt: new Date().toISOString(),
    ...input,
  };

  auditStore.add(entry);
  void platformApi.createAuditLog(entry);
  return entry;
}

export function getRecentAuditEvents(limit = 20): AuditLogEntry[] {
  return auditStore.getAll().slice(0, limit);
}
