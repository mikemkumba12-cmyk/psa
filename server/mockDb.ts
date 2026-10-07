import bcrypt from 'bcrypt';
import fs from 'fs/promises';
import path from 'path';
import {
  initialAlertNotifications,
  initialCustomers,
  initialLoanApplications,
  initialRepayments,
  initialSmeBusinesses,
} from '../src/data';
import type {
  AlertNotification,
  AuditLogEntry,
  Customer,
  LoanApplication,
  Repayment,
  SmeBusiness,
  StoredUser,
} from '../src/types';

type Dictionary<T> = Record<string, T>;

interface MockConversationRecord {
  id: string;
  participantIds: string[];
  createdAt: string;
  lastMessageAt: string;
  data: { id: string; participantIds: string[] };
}

interface MockMessageRecord {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  sentAt: string;
  readBy: string[];
}

interface MockDbState {
  version: 1;
  loanApplications: Dictionary<LoanApplication>;
  repayments: Dictionary<Repayment>;
  customers: Dictionary<Customer>;
  businesses: Dictionary<SmeBusiness>;
  alerts: Dictionary<AlertNotification>;
  documents: Dictionary<any>;
  auditLogs: Dictionary<AuditLogEntry>;
  users: Dictionary<StoredUser>;
  conversations: Dictionary<MockConversationRecord>;
  messages: Dictionary<MockMessageRecord>;
}

export const mockDbFilePath = path.resolve(
  process.cwd(),
  process.env.MOCK_DB_FILE || path.join('server', 'data', 'mock-db.json')
);

let cachedState: MockDbState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function emptyState(): MockDbState {
  return {
    version: 1,
    loanApplications: {},
    repayments: {},
    customers: {},
    businesses: {},
    alerts: {},
    documents: {},
    auditLogs: {},
    users: {},
    conversations: {},
    messages: {},
  };
}

function byId<T extends { id: string }>(items: T[]): Dictionary<T> {
  return items.reduce<Dictionary<T>>((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {});
}

function normalizeState(raw: Partial<MockDbState> | null | undefined): MockDbState {
  const base = emptyState();
  if (!raw) return base;

  return {
    ...base,
    ...raw,
    version: 1,
    loanApplications: raw.loanApplications || {},
    repayments: raw.repayments || {},
    customers: raw.customers || {},
    businesses: raw.businesses || {},
    alerts: raw.alerts || {},
    documents: raw.documents || {},
    auditLogs: raw.auditLogs || {},
    users: raw.users || {},
    conversations: raw.conversations || {},
    messages: raw.messages || {},
  };
}

async function loadState(): Promise<MockDbState> {
  if (cachedState) return cachedState;

  try {
    const raw = await fs.readFile(mockDbFilePath, 'utf8');
    cachedState = normalizeState(JSON.parse(raw) as Partial<MockDbState>);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') {
      console.warn(`[Pinnacle API] Could not read mock database. Starting with a clean file-backed store: ${error?.message || error}`);
    }
    cachedState = emptyState();
  }

  return cachedState;
}

async function persistState(state: MockDbState): Promise<void> {
  await fs.mkdir(path.dirname(mockDbFilePath), { recursive: true });
  const tmpPath = `${mockDbFilePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  await fs.rename(tmpPath, mockDbFilePath);
}

async function readDb<T>(reader: (db: MockDbState) => T): Promise<T> {
  await writeQueue;
  const db = await loadState();
  return reader(db);
}

async function writeDb<T>(writer: (db: MockDbState) => T | Promise<T>): Promise<T> {
  const next = writeQueue.then(async () => {
    const db = await loadState();
    const result = await writer(db);
    await persistState(db);
    return result;
  });

  writeQueue = next.then(
    () => undefined,
    () => undefined
  );

  return next;
}

function parseDate(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

const configuredBcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);
const bcryptRounds = Number.isFinite(configuredBcryptRounds) ? configuredBcryptRounds : 12;

async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, bcryptRounds);
}

function stripSensitive(user: StoredUser) {
  const { passwordHash, securityAnswerHash, ...safe } = user;
  return safe;
}

export async function ensureMockSchema(): Promise<void> {
  await writeDb(() => undefined);
}

export async function seedMockInitialData(): Promise<void> {
  const passwordHash = await hashSecret('PINACO@2026');
  const answerHash = await hashSecret('lilongwe');

  await writeDb(db => {
    if (Object.keys(db.loanApplications).length === 0) {
      db.loanApplications = byId(initialLoanApplications);
    }

    for (const repayment of initialRepayments) {
      db.repayments[repayment.id] ??= repayment;
    }

    for (const customer of initialCustomers) {
      db.customers[customer.id] ??= customer;
    }

    for (const alert of initialAlertNotifications) {
      db.alerts[alert.id] ??= alert;
    }

    for (const business of initialSmeBusinesses) {
      db.businesses[business.id] ??= business;
    }

    if (Object.keys(db.users).length === 0) {
      const demoStaff: StoredUser[] = [
        {
          id: 'staff-001',
          role: 'admin',
          fullName: 'Thoko Kamanga (Demo)',
          email: 'admin@pinnacle.mw',
          phone: '+265 111 000 001',
          address: 'Pinnacle MFI HQ, Lilongwe',
          nationalId: 'STAFF-001',
          dob: '1985-04-12',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '1200000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'System Administrator (Demo)',
        },
        {
          id: 'staff-002',
          role: 'loan_officer',
          fullName: 'Chisomo Banda (Demo)',
          email: 'chisomo@pinnacle.mw',
          phone: '+265 888 100 001',
          address: 'Pinnacle Lilongwe Branch',
          nationalId: 'STAFF-002',
          dob: '1992-08-23',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '750000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Loan Officer (Demo)',
        },
        {
          id: 'staff-003',
          role: 'manager',
          fullName: 'Grace Phiri (Demo)',
          email: 'grace@pinnacle.mw',
          phone: '+265 999 200 002',
          address: 'Pinnacle Lilongwe Branch',
          nationalId: 'STAFF-003',
          dob: '1988-11-05',
          gender: 'Female',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '950000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Operations Manager (Demo)',
        },
        {
          id: 'staff-004',
          role: 'executive',
          fullName: 'Kondwani Mbewe (Demo)',
          email: 'kondwani@pinnacle.mw',
          phone: '+265 888 300 003',
          address: 'Pinnacle HQ, Lilongwe',
          nationalId: 'STAFF-004',
          dob: '1979-02-28',
          gender: 'Male',
          employmentType: 'Employed',
          employer: 'Pinnacle MFI',
          monthlyIncome: '1500000',
          customerType: 'individual',
          passwordHash,
          securityQuestion: 'What city were you born in?',
          securityAnswerHash: answerHash,
          createdAt: new Date().toISOString(),
          notificationPrefs: { sms: true, email: true, push: true },
          staffTitle: 'Executive Director (Demo)',
        }
      ];

      for (const staffUser of demoStaff) {
        db.users[staffUser.id] = staffUser;
      }
    }

    db.auditLogs['audit-seed-001'] ??= {
      id: 'audit-seed-001',
      occurredAt: new Date().toISOString(),
      actorId: 'system',
      actorName: 'Pinnacle Platform',
      actorRole: 'system',
      action: 'system.seed_demo_data',
      entityType: 'system',
      outcome: 'success',
      summary: 'Initial demo data seeded for the digital lending prototype.',
      metadata: {},
    };
  });
}

export const mockDb = {
  getAllLoanApplications: () =>
    readDb(db => Object.values(db.loanApplications).sort((a, b) => parseDate(b.date) - parseDate(a.date))),

  getLoanApplicationById: (id: string) =>
    readDb(db => db.loanApplications[id] ?? null),

  upsertLoanApplication: (application: LoanApplication) =>
    writeDb(db => {
      db.loanApplications[application.id] = application;
    }),

  getAllRepayments: () =>
    readDb(db => Object.values(db.repayments).sort((a, b) => parseDate(b.dueDate) - parseDate(a.dueDate))),

  getRepaymentById: (id: string) =>
    readDb(db => db.repayments[id] ?? null),

  upsertRepayment: (repayment: Repayment) =>
    writeDb(db => {
      db.repayments[repayment.id] = repayment;
    }),

  getAllCustomers: () =>
    readDb(db => Object.values(db.customers).sort((a, b) => a.name.localeCompare(b.name))),

  upsertCustomer: (customer: Customer) =>
    writeDb(db => {
      db.customers[customer.id] = customer;
    }),

  getAllBusinesses: () =>
    readDb(db => Object.values(db.businesses).sort((a, b) => a.name.localeCompare(b.name))),

  getBusinessesByCustomerId: (customerId: string) =>
    readDb(db => {
      const aliases = customerId.startsWith('cust-')
        ? [customerId, customerId.slice(5)]
        : [customerId, `cust-${customerId}`];
      return Object.values(db.businesses)
        .filter(business => aliases.includes(business.customerId))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),

  getBusinessById: (id: string) =>
    readDb(db => db.businesses[id] ?? null),

  upsertBusiness: (business: SmeBusiness) =>
    writeDb(db => {
      db.businesses[business.id] = business;
    }),

  getAllAlerts: () =>
    readDb(db => Object.values(db.alerts).sort((a, b) => parseDate(b.date) - parseDate(a.date))),

  upsertAlert: (alert: AlertNotification) =>
    writeDb(db => {
      db.alerts[alert.id] = alert;
    }),

  getUserByEmail: (email: string) =>
    readDb(db => Object.values(db.users).find(user => user.email.toLowerCase() === email.toLowerCase()) ?? null),

  getUserById: (id: string) =>
    readDb(db => db.users[id] ?? null),

  upsertUser: (user: StoredUser) =>
    writeDb(db => {
      db.users[user.id] = user;
    }),

  getDocumentsForUser: (userId: string) =>
    readDb(db => Object.values(db.documents)
      .filter(document => document.userId === userId)
      .sort((a, b) => parseDate(b.uploadedAt) - parseDate(a.uploadedAt))),

  upsertDocument: (document: any & { id: string }) =>
    writeDb(db => {
      db.documents[document.id] = document;
    }),

  getAllAuditLogs: () =>
    readDb(db => Object.values(db.auditLogs).sort((a, b) => parseDate(b.occurredAt) - parseDate(a.occurredAt))),

  createAuditLog: (entry: AuditLogEntry) =>
    writeDb(db => {
      db.auditLogs[entry.id] ??= entry;
    }),

  getDashboardSummary: () =>
    readDb(db => {
      const applications = Object.values(db.loanApplications);
      const repayments = Object.values(db.repayments);
      const auditLogs = Object.values(db.auditLogs)
        .sort((a, b) => parseDate(b.occurredAt) - parseDate(a.occurredAt))
        .slice(0, 10);

      const totalDisbursed = applications
        .filter(application => ['Disbursed', 'Approved', 'Completed'].includes(application.status))
        .reduce((sum, application) => sum + (Number(application.amount) || 0), 0);

      const totalCollected = repayments
        .filter(repayment => repayment.status === 'Paid')
        .reduce((sum, repayment) => sum + (Number(repayment.amount) || 0), 0);

      const monthlyMap: Record<string, number> = {};
      for (const application of applications) {
        const parsed = parseDate(application.date);
        if (!parsed) continue;
        const key = new Date(parsed).toISOString().slice(0, 7);
        monthlyMap[key] = (monthlyMap[key] || 0) + Number(application.amount || 0);
      }

      const sectorMap: Record<string, { disbursed: number; count: number }> = {};
      for (const application of applications) {
        const sector = application.sector || 'Other';
        sectorMap[sector] ??= { disbursed: 0, count: 0 };
        sectorMap[sector].disbursed += Number(application.amount || 0);
        sectorMap[sector].count++;
      }

      return {
        totalDisbursed,
        totalCollected,
        collectionRate: totalDisbursed > 0 ? Number(((totalCollected / totalDisbursed) * 100).toFixed(2)) : 0,
        totalInterestEarned: Math.round(totalDisbursed * 0.1),
        pendingCount: applications.filter(application => ['Under Review', 'In Progress', 'Reviewing'].includes(application.status)).length,
        activeCount: applications.filter(application => ['Approved', 'Disbursed'].includes(application.status)).length,
        totalApplications: applications.length,
        monthlyDisbursements: Object.entries(monthlyMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .slice(-12)
          .map(([month, amount]) => ({
            name: new Date(`${month}-01`).toLocaleString('default', { month: 'short' }),
            amount,
          })),
        sectorBreakdown: Object.entries(sectorMap)
          .map(([sector, value]) => ({
            sector,
            disbursed: value.disbursed,
            count: value.count,
            pct: totalDisbursed > 0 ? Math.round((value.disbursed / totalDisbursed) * 100) : 0,
          }))
          .sort((a, b) => b.disbursed - a.disbursed),
        recentAuditActivity: auditLogs,
      };
    }),

  listConversations: (userId: string) =>
    readDb(db => Object.values(db.conversations)
      .filter(conversation => conversation.participantIds.includes(userId))
      .map(conversation => {
        const messages = Object.values(db.messages)
          .filter(message => message.conversationId === conversation.id)
          .sort((a, b) => parseDate(a.sentAt) - parseDate(b.sentAt));
        const lastMessage = messages.at(-1);
        return {
          id: conversation.id,
          data: conversation.data,
          last_message_at: conversation.lastMessageAt,
          last_msg: lastMessage ? {
            content: lastMessage.content,
            sender_id: lastMessage.senderId,
            sent_at: lastMessage.sentAt,
          } : null,
          unread_count: messages.filter(message => !message.readBy.includes(userId) && message.senderId !== userId).length,
        };
      })
      .sort((a, b) => parseDate(b.last_message_at) - parseDate(a.last_message_at))),

  getOrCreateConversation: (userId: string, staffId: string) =>
    writeDb(db => {
      const existing = Object.values(db.conversations).find(conversation =>
        conversation.participantIds.includes(userId) && conversation.participantIds.includes(staffId)
      );
      if (existing) return { id: existing.id, data: existing.data };

      const now = new Date().toISOString();
      const id = `conv-${Date.now()}`;
      const data = { id, participantIds: [userId, staffId] };
      db.conversations[id] = {
        id,
        participantIds: [userId, staffId],
        createdAt: now,
        lastMessageAt: now,
        data,
      };
      return { id, data };
    }),

  getMessages: (conversationId: string, after?: string) =>
    readDb(db => Object.values(db.messages)
      .filter(message => message.conversationId === conversationId && (!after || parseDate(message.sentAt) > parseDate(after)))
      .sort((a, b) => parseDate(a.sentAt) - parseDate(b.sentAt))
      .slice(0, 100)
      .map(message => ({
        id: message.id,
        conversation_id: message.conversationId,
        sender_id: message.senderId,
        content: message.content,
        sent_at: message.sentAt,
        read_by: message.readBy,
      }))),

  createMessage: (id: string, conversationId: string, senderId: string, content: string) =>
    writeDb(db => {
      const now = new Date().toISOString();
      db.messages[id] = {
        id,
        conversationId,
        senderId,
        content,
        sentAt: now,
        readBy: [senderId],
      };
      if (db.conversations[conversationId]) {
        db.conversations[conversationId].lastMessageAt = now;
      }
      return { id, conversationId, senderId, content, sentAt: now, readBy: [senderId] };
    }),

  markMessagesRead: (conversationId: string, userId: string) =>
    writeDb(db => {
      for (const message of Object.values(db.messages)) {
        if (message.conversationId === conversationId && message.senderId !== userId && !message.readBy.includes(userId)) {
          message.readBy.push(userId);
        }
      }
    }),

  listStaffUsers: () =>
    readDb(db => Object.values(db.users)
      .filter(user => user.role !== 'customer')
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(stripSensitive)),

  createStaffUser: (staffData: StoredUser) =>
    writeDb(db => {
      db.users[staffData.id] = staffData;
    }),

  updateStaffUser: (id: string, patch: Record<string, any>) =>
    writeDb(db => {
      const user = db.users[id];
      if (!user) throw new Error('Staff user not found');
      const updated = { ...user, ...patch };
      db.users[id] = updated;
      return stripSensitive(updated);
    }),
};


