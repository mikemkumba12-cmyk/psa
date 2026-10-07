import 'dotenv/config';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';
import { mkdir } from 'fs/promises';
import { sendEmail, sendSms } from './notifications';
import {
  computeDynamicPortfolioTimeline,
  computeDynamicSectorTrends,
  computeSegmentDistribution,
  detectFraudFlags,
  generateDynamicInsights,
  runExpertSystem,
} from '../src/lib/intelligenceEngine';
import { generateUserMockBundle } from '../src/lib/mockDataGenerator';
import { payrollRepository } from './repositories/payrollRepository';
import type { AlertNotification, AuditLogEntry, BusinessDocument, BusinessTimelineEvent, Customer, FinancingRequest, LoanApplication, Repayment, SmeBusiness, StoredUser } from '../src/types';
import {
  ensureSchema,
  seedInitialData,
  getAllLoanApplications,
  getLoanApplicationById,
  upsertLoanApplication,
  getAllRepayments,
  getRepaymentById,
  upsertRepayment,
  getAllCustomers,
  upsertCustomer,
  getAllBusinesses,
  getBusinessById,
  getBusinessesByCustomerId,
  upsertBusiness,
  getAllAlerts,
  upsertAlert,
  getDocumentsForUser,
  upsertDocument,
  getAllAuditLogs,
  createAuditLog,
  getUserByEmail,
  getUserById,
  upsertUser,
  getDashboardSummary,
  listConversations,
  getOrCreateConversation,
  getMessages,
  createMessage,
  markMessagesRead,
  listStaffUsers,
  createStaffUser,
  updateStaffUser,
  getStorageMode,
} from './db';

interface StoredDocumentPayload {
  id: string;
  userId: string;
  name: string;
  type: string;
  size: number;
  base64: string;
  uploadedAt: string;
  category: string;
}

// ── Simple in-memory rate limiter ───────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function rateLimit(maxPerWindow: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || entry.resetAt < now) {
      rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > maxPerWindow) {
      res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
      return;
    }
    next();
  };
}

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(express.json({ limit: '15mb' }));

// ── V1 API Route Modules (Phase 4 Clean Architecture) ──────────────────────────
import authRoutes from './routes/api/v1/auth.routes';
import customerRoutes from './routes/api/v1/customer.routes';
import loanRoutes from './routes/api/v1/loan.routes';
import payrollRoutes from './routes/api/v1/payroll.routes';
import intelligenceRoutes from './routes/api/v1/intelligence.routes';
import governanceRoutes from './routes/api/v1/governance.routes';
import { authenticateJwt } from './middleware/auth';
import { scenarioGeneratorService, type DemoScenario } from './services/scenarioGeneratorService';
import { Router as ExpressRouter } from 'express';

// ── Scenario Switcher at canonical /api/v1/scenarios path (API spec §7) ───────
const scenarioRoutes = ExpressRouter();
scenarioRoutes.get('/active', (_req, res) => {
  res.json({ success: true, scenario: scenarioGeneratorService.getActiveScenario() });
});
scenarioRoutes.post('/switch', (req, res) => {
  const { scenario } = req.body as { scenario: DemoScenario };
  if (!['Healthy Portfolio', 'High Default Risk', 'Payroll Crisis'].includes(scenario)) {
    res.status(400).json({ success: false, error: 'Invalid scenario type' });
    return;
  }
  const updated = scenarioGeneratorService.switchScenario(scenario);
  res.json({ success: true, scenario: updated });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', authenticateJwt, customerRoutes);
app.use('/api/v1/loans', authenticateJwt, loanRoutes);
app.use('/api/v1/payroll', authenticateJwt, payrollRoutes);
app.use('/api/v1/intelligence', authenticateJwt, intelligenceRoutes);
app.use('/api/v1/governance', authenticateJwt, governanceRoutes);
app.use('/api/v1/scenarios', scenarioRoutes); // No auth required for demo scenario switching

// ── Multipart form data parser (basic, for file uploads) ──────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const contentType = req.header('Content-Type') || '';
  if (contentType.startsWith('multipart/form-data')) {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => {
      (req as any).rawBody = body;
      next();
    });
  } else {
    next();
  }
});
app.use((req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;
  const allowed = (process.env.APP_URL || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const allowAny = allowed.length === 0 || allowed.includes('*');

  if (allowAny) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Actor-Id, X-Actor-Name, X-Actor-Role');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});

interface AuthenticatedActor {
  userId: string;
  fullName: string;
  email: string;
  role: StoredUser['role'];
}

interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedActor;
}

interface AuthTokenPayload {
  sub: string;
  role: StoredUser['role'];
  fullName: string;
  email: string;
  iat: number;
  exp: number;
}

function getActor(req: Request): Pick<AuditLogEntry, 'actorId' | 'actorName' | 'actorRole'> {
  const authenticated = (req as AuthenticatedRequest).auth;
  if (authenticated) {
    return {
      actorId: authenticated.userId,
      actorName: authenticated.fullName,
      actorRole: authenticated.role as any,
    };
  }

  const roleHeader = req.header('X-Actor-Role') || '';
  const role: AuditLogEntry['actorRole'] = ['customer', 'loan_officer', 'manager', 'executive', 'admin', 'client', 'staff', 'system'].includes(roleHeader)
    ? (roleHeader as any)
    : 'system';

  return {
    actorId: req.header('X-Actor-Id') || 'api-user',
    actorName: req.header('X-Actor-Name') || 'API User',
    actorRole: role,
  };
}

const legacyHashSalt = 'psa_salt_v1';
const configuredBcryptRounds = Number(process.env.BCRYPT_ROUNDS || 12);
const bcryptRounds = Number.isFinite(configuredBcryptRounds) ? configuredBcryptRounds : 12;

function legacyHashSecret(value: string): string {
  return crypto.createHash('sha256').update(value + legacyHashSalt).digest('hex');
}

function isLegacySha256Hash(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value);
}

function timingSafeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashSecret(value: string): Promise<string> {
  return bcrypt.hash(value, bcryptRounds);
}

async function verifySecret(value: string, storedHash: string): Promise<{ valid: boolean; needsRehash: boolean }> {
  if (!storedHash) return { valid: false, needsRehash: false };

  if (storedHash.startsWith('$2')) {
    const valid = await bcrypt.compare(value, storedHash);
    if (!valid) return { valid: false, needsRehash: false };
    return { valid: true, needsRehash: bcrypt.getRounds(storedHash) < bcryptRounds };
  }

  if (isLegacySha256Hash(storedHash)) {
    const valid = timingSafeStringEqual(legacyHashSecret(value), storedHash);
    return { valid, needsRehash: valid };
  }

  return { valid: false, needsRehash: false };
}

function normalizeSecurityAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function createSessionPayload(user: StoredUser, expiresAt: string) {
  return {
    userId: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    address: user.address,
    monthlyIncome: user.monthlyIncome,
    customerType: user.customerType,
    createdAt: user.createdAt,
    expiresAt,
    staffTitle: user.staffTitle,
  };
}

const authSecret = process.env.AUTH_SECRET || 'pinnacle-local-development-auth-secret';
const authTokenTtlMs = Number(process.env.AUTH_TOKEN_TTL_HOURS || 12) * 60 * 60 * 1000;
const passwordResetTokenTtlMs = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES || 15) * 60 * 1000;

interface PasswordResetTokenRecord {
  userId: string;
  tokenHash: string;
  expiresAt: number;
}

const passwordResetTokens = new Map<string, PasswordResetTokenRecord>();

function signAuthToken(user: StoredUser): { token: string; expiresAt: string } {
  const now = Date.now();
  const exp = now + authTokenTtlMs;
  const payload: AuthTokenPayload = {
    sub: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    iat: now,
    exp,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  return { token: `${body}.${signature}`, expiresAt: new Date(exp).toISOString() };
}

const jwtSecretKey = process.env.JWT_SECRET || 'psa-super-secret-jwt-key-2026';
const authSecrets = [authSecret, jwtSecretKey];

function verifyAuthToken(token: string): AuthTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length === 2) {
      const [body, signature] = parts;
      let valid = false;
      for (const s of authSecrets) {
        const expected = crypto.createHmac('sha256', s).update(body).digest('base64url');
        const signatureBuffer = Buffer.from(signature);
        const expectedBuffer = Buffer.from(expected);
        if (signatureBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
          valid = true;
          break;
        }
      }
      if (!valid) return null;

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      const sub = payload.sub || payload.id;
      if (!sub) return null;
      const expMs = payload.exp ? (payload.exp < 1e11 ? payload.exp * 1000 : payload.exp) : Date.now() + 86400000;
      if (expMs < Date.now()) return null;

      return {
        sub,
        role: payload.role || 'customer',
        fullName: payload.fullName || payload.name || payload.email || '',
        email: payload.email || '',
        iat: payload.iat ? (payload.iat < 1e11 ? payload.iat * 1000 : payload.iat) : Date.now(),
        exp: expMs,
      };
    } else if (parts.length === 3) {
      const [headerB64, payloadB64, signature] = parts;
      let valid = false;
      for (const s of authSecrets) {
        const expected = crypto
          .createHmac('sha256', s)
          .update(`${headerB64}.${payloadB64}`)
          .digest('base64')
          .replace(/=/g, '')
          .replace(/\+/g, '-')
          .replace(/\//g, '_');
        if (signature === expected) {
          valid = true;
          break;
        }
      }
      if (!valid) return null;

      const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      const sub = payload.sub || payload.id;
      if (!sub) return null;
      const expMs = payload.exp ? (payload.exp < 1e11 ? payload.exp * 1000 : payload.exp) : Date.now() + 86400000;
      if (expMs < Date.now()) return null;

      return {
        sub,
        role: payload.role || 'customer',
        fullName: payload.fullName || payload.name || payload.email || '',
        email: payload.email || '',
        iat: payload.iat ? (payload.iat < 1e11 ? payload.iat * 1000 : payload.iat) : Date.now(),
        exp: expMs,
      };
    }
    return null;
  } catch {
    return null;
  }
}

function hashResetToken(token: string): string {
  return crypto.createHmac('sha256', authSecret).update(token).digest('base64url');
}

function prunePasswordResetTokens(): void {
  const now = Date.now();
  for (const [tokenHash, record] of passwordResetTokens.entries()) {
    if (record.expiresAt <= now) passwordResetTokens.delete(tokenHash);
  }
}

function createPasswordResetToken(userId: string): { resetToken: string; expiresAt: string } {
  prunePasswordResetTokens();
  for (const [tokenHash, record] of passwordResetTokens.entries()) {
    if (record.userId === userId) passwordResetTokens.delete(tokenHash);
  }

  const resetToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(resetToken);
  const expiresAt = Date.now() + passwordResetTokenTtlMs;
  passwordResetTokens.set(tokenHash, { userId, tokenHash, expiresAt });
  return { resetToken, expiresAt: new Date(expiresAt).toISOString() };
}

function consumePasswordResetToken(resetToken: string): string | null {
  prunePasswordResetTokens();
  const tokenHash = hashResetToken(resetToken);
  const record = passwordResetTokens.get(tokenHash);
  if (!record) return null;
  passwordResetTokens.delete(tokenHash);
  return record.userId;
}

function getBearerToken(req: Request): string | null {
  const header = req.header('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() === 'bearer' && token) return token;
  return typeof req.query.token === 'string' && req.query.token ? req.query.token : null;
}

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authReq = req as AuthenticatedRequest;
  const token = getBearerToken(req);
  const payload = token ? verifyAuthToken(token) : null;
  if (!payload) {
    res.status(401).json({ error: 'Authentication is required.' });
    return;
  }

  const user = await getUserById(payload.sub);
  if (!user) {
    res.status(401).json({ error: 'Authentication is required.' });
    return;
  }

  authReq.auth = {
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
  next();
}

function canAccessUser(req: AuthenticatedRequest, userId: string): boolean {
  return ['loan_officer', 'manager', 'executive', 'admin', 'staff'].includes(req.auth?.role || '') || req.auth?.userId === userId;
}

app.get('/api/health', (_req, res) => {
  const storageMode = getStorageMode();
  res.json({
    ok: true,
    service: 'pinnacle-api',
    time: new Date().toISOString(),
    storageMode,
    database: storageMode === 'postgres' ? 'PostgreSQL' : 'File-backed Mock',
  });
});

app.post('/api/auth/register', rateLimit(10, 15 * 60 * 1000), async (req, res) => {
  const payload = req.body as Partial<StoredUser> & { password?: string; securityAnswer?: string };
  if (!payload.email || !payload.password || !payload.fullName || !payload.securityQuestion || !payload.securityAnswer) {
    res.status(400).json({ error: 'Missing registration fields.' });
    return;
  }

  const existing = await getUserByEmail(payload.email);
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const user: StoredUser = {
    id: `client-${Date.now()}`,
    role: 'customer',
    fullName: payload.fullName,
    email: payload.email.toLowerCase(),
    phone: payload.phone || '',
    address: payload.address || '',
    nationalId: payload.nationalId || '',
    dob: payload.dob || '',
    gender: payload.gender || '',
    employmentType: payload.employmentType || '',
    employer: payload.employer || '',
    monthlyIncome: payload.monthlyIncome || '',
    customerType: payload.customerType || 'individual',
    passwordHash: await hashSecret(payload.password),
    securityQuestion: payload.securityQuestion,
    securityAnswerHash: await hashSecret(normalizeSecurityAnswer(payload.securityAnswer)),
    createdAt: new Date().toISOString(),
    notificationPrefs: { sms: true, email: true, push: true },
  };

  await upsertUser(user);

  // Future backend integration: keep onboarding data creation transactional around the user account.
  const bundle = generateUserMockBundle(user);
  await upsertCustomer(bundle.customer);
  await Promise.all([
    ...bundle.applications.map(application => upsertLoanApplication(application)),
    ...bundle.repayments.map(repayment => upsertRepayment(repayment)),
    ...bundle.alerts.map(alert => upsertAlert(alert)),
    ...(bundle.business ? [upsertBusiness(bundle.business)] : []),
  ]);

  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'auth.register',
    entityType: 'user',
    entityId: user.id,
    outcome: 'success',
    summary: `New client user ${user.fullName} registered via API.`,
    metadata: { email: user.email, customerType: user.customerType },
  });

  // Trigger real SMS and Email welcome notifications
  void sendEmail(
    user.email,
    'Welcome to Pinnacle Microfinance',
    `<h2>Welcome to Pinnacle MFI, ${user.fullName}!</h2>
     <p>Your digital account has been created successfully.</p>
     <p>You can now log in to calculate financing rates, submit loan applications, and manage your account.</p>`
  );

  if (user.phone) {
    void sendSms(
      user.phone,
      `Hi ${user.fullName}, welcome to Pinnacle MFI! Your digital lending account is active. Log in to apply for financing.`
    );
  }

  res.status(201).json({ success: true });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const user = await getUserByEmail(email);
  if (!user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const passwordCheck = await verifySecret(password, user.passwordHash);
  if (!passwordCheck.valid) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const activeUser = passwordCheck.needsRehash
    ? { ...user, passwordHash: await hashSecret(password) }
    : user;
  if (passwordCheck.needsRehash) {
    await upsertUser(activeUser);
  }

  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    actorId: user.id,
    actorName: user.fullName,
    actorRole: user.role,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    outcome: 'success',
    summary: `User ${user.email} logged in via API.`,
    metadata: { role: user.role },
  });

  const authToken = signAuthToken(activeUser);
  res.json({ session: createSessionPayload(activeUser, authToken.expiresAt), token: authToken.token });
});

app.post('/api/auth/forgot-password/question', async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = await getUserByEmail(email);
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  res.json({ securityQuestion: user.securityQuestion });
});

app.post('/api/auth/forgot-password/verify', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { email, securityAnswer } = req.body as { email?: string; securityAnswer?: string };
  if (!email || !securityAnswer) {
    res.status(400).json({ error: 'Email and security answer are required.' });
    return;
  }

  const user = await getUserByEmail(email);
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const normalizedAnswer = normalizeSecurityAnswer(securityAnswer);
  let answerCheck = await verifySecret(normalizedAnswer, user.securityAnswerHash);
  if (!answerCheck.valid && securityAnswer.trim() !== normalizedAnswer) {
    answerCheck = await verifySecret(securityAnswer.trim(), user.securityAnswerHash);
  }

  if (!answerCheck.valid) {
    res.status(401).json({ error: 'Incorrect security answer.' });
    return;
  }

  if (answerCheck.needsRehash) {
    await upsertUser({ ...user, securityAnswerHash: await hashSecret(normalizedAnswer) });
  }

  const reset = createPasswordResetToken(user.id);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'auth.password_reset_verified',
    entityType: 'user',
    entityId: user.id,
    outcome: 'success',
    summary: `Password reset verification succeeded for user ${user.email}.`,
    metadata: { expiresAt: reset.expiresAt },
  });

  res.json(reset);
});

app.post('/api/auth/forgot-password/reset', rateLimit(5, 15 * 60 * 1000), async (req, res) => {
  const { resetToken, newPassword } = req.body as { resetToken?: string; newPassword?: string };
  if (!resetToken || !newPassword) {
    res.status(400).json({ error: 'Reset token and new password are required.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }

  const userId = consumePasswordResetToken(resetToken);
  if (!userId) {
    res.status(401).json({ error: 'Password reset token is invalid or expired.' });
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  await upsertUser({ ...user, passwordHash: await hashSecret(newPassword) });

  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'auth.password_reset',
    entityType: 'user',
    entityId: user.id,
    outcome: 'success',
    summary: `Password reset for user ${user.email} via API.`,
    metadata: {},
  });

  res.json({ success: true });
});

app.use('/api', requireAuth);

app.get('/api/auth/profile/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  if (!canAccessUser(authReq, req.params.id)) {
    res.status(403).json({ error: 'You do not have access to this user profile.' });
    return;
  }

  const user = await getUserById(req.params.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  const { passwordHash, securityAnswerHash, ...profile } = user;
  res.json(profile);
});

app.patch('/api/auth/profile/:id', async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  const { id } = req.params;
  if (!canAccessUser(authReq, id)) {
    res.status(403).json({ error: 'You do not have access to this user profile.' });
    return;
  }

  const user = await getUserById(id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const patch = req.body as Partial<StoredUser>;
  const updateFields: Partial<StoredUser> = {
    fullName: patch.fullName ?? user.fullName,
    phone: patch.phone ?? user.phone,
    address: patch.address ?? user.address,
    nationalId: patch.nationalId ?? user.nationalId,
    dob: patch.dob ?? user.dob,
    gender: patch.gender ?? user.gender,
    employmentType: patch.employmentType ?? user.employmentType,
    employer: patch.employer ?? user.employer,
    monthlyIncome: patch.monthlyIncome ?? user.monthlyIncome,
    customerType: patch.customerType ?? user.customerType,
    notificationPrefs: patch.notificationPrefs ?? user.notificationPrefs,
  };

  const updatedUser: StoredUser = {
    ...user,
    ...updateFields,
  };

  await upsertUser(updatedUser);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'auth.profile_update',
    entityType: 'user',
    entityId: id,
    outcome: 'success',
    summary: `Profile updated for user ${id} via API.`,
    metadata: { fields: Object.keys(updateFields).join(', ') },
  });

  const { passwordHash, securityAnswerHash, ...profile } = updatedUser;
  res.json(profile);
});

app.get('/api/applications', async (_req, res) => {
  const applications = await getAllLoanApplications();
  res.json(applications);
});

app.post('/api/applications', async (req, res) => {
  const application = req.body as LoanApplication;
  if (!application?.id) {
    res.status(400).json({ error: 'Loan application id is required.' });
    return;
  }

  await upsertLoanApplication(application);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'loan_application.create',
    entityType: 'loan_application',
    entityId: application.id,
    outcome: 'success',
    summary: `Loan application ${application.id} created through API.`,
    metadata: { amount: application.amount, sector: application.sector, status: application.status },
  });

  if (application.email) {
    void sendEmail(
      application.email,
      `Loan Application Submitted [${application.id}]`,
      `<h2>Application Received</h2>
       <p>Dear ${application.applicantName},</p>
       <p>Your loan application <strong>#${application.id}</strong> for <strong>MWK ${application.amount.toLocaleString()}</strong> has been received and is currently under review by our risk assessment team.</p>
       <p>Status: <strong>${application.status}</strong></p>`
    );
  }
  if (application.phone) {
    void sendSms(
      application.phone,
      `Pinnacle MFI: Application #${application.id} for MWK ${application.amount.toLocaleString()} submitted successfully. Under review.`
    );
  }

  res.status(201).json(application);
});

app.patch('/api/applications/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await getLoanApplicationById(id);
  if (!existing) {
    res.status(404).json({ error: 'Loan application not found.' });
    return;
  }

  const updated = { ...existing, ...(req.body as Partial<LoanApplication>) };
  await upsertLoanApplication(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'loan_application.update',
    entityType: 'loan_application',
    entityId: id,
    outcome: 'success',
    summary: `Loan application ${id} updated through API.`,
    metadata: { status: updated.status },
  });

  // If status changed, notify applicant
  if (existing.status !== updated.status) {
    if (updated.email) {
      void sendEmail(
        updated.email,
        `Loan Status Update [${updated.id}]`,
        `<h2>Loan Status Update</h2>
         <p>Dear ${updated.applicantName},</p>
         <p>Your loan application <strong>#${updated.id}</strong> status has been updated to: <strong>${updated.status}</strong>.</p>
         ${updated.notes ? `<p>Officer Note: ${updated.notes}</p>` : ''}`
      );
    }
    if (updated.phone) {
      void sendSms(
        updated.phone,
        `Pinnacle MFI: Your loan application #${updated.id} status is now ${updated.status}. Log in to view details.`
      );
    }
  }

  res.json(updated);
});

app.get('/api/repayments', async (_req, res) => {
  const repayments = await getAllRepayments();
  res.json(repayments);
});

app.patch('/api/repayments/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await getRepaymentById(id);
  if (!existing) {
    res.status(404).json({ error: 'Repayment not found.' });
    return;
  }

  const updated = { ...existing, ...(req.body as Partial<Repayment>) };
  await upsertRepayment(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'repayment.update',
    entityType: 'repayment',
    entityId: id,
    outcome: 'success',
    summary: `Repayment ${id} updated through API.`,
    metadata: { status: updated.status },
  });
  res.json(updated);
});

app.get('/api/customers', async (_req, res) => {
  const customers = await getAllCustomers();
  res.json(customers);
});

app.post('/api/customers', async (req, res) => {
  const customer = req.body as Customer;
  if (!customer?.id) {
    res.status(400).json({ error: 'Customer id is required.' });
    return;
  }

  await upsertCustomer(customer);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'customer.create',
    entityType: 'customer',
    entityId: customer.id,
    outcome: 'success',
    summary: `Customer ${customer.id} created through API.`,
    metadata: { sector: customer.sector, riskLevel: customer.riskLevel },
  });
  res.status(201).json(customer);
});

app.get('/api/businesses', async (_req, res) => {
  const businesses = await getAllBusinesses();
  res.json(businesses);
});

app.get('/api/businesses/customer/:customerId', async (req, res) => {
  const businesses = await getBusinessesByCustomerId(req.params.customerId);
  res.json(businesses);
});

app.post('/api/businesses', async (req, res) => {
  const business = req.body as SmeBusiness;
  if (!business?.id || !business.name) {
    res.status(400).json({ error: 'Business id and name are required.' });
    return;
  }

  await upsertBusiness(business);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'sme_business.create',
    entityType: 'sme_business',
    entityId: business.id,
    outcome: 'success',
    summary: `SME business ${business.name} created through API.`,
    metadata: { sector: business.sector, verificationStatus: business.verificationStatus },
  });
  res.status(201).json(business);
});

app.patch('/api/businesses/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await getBusinessById(id);
  if (!existing) {
    res.status(404).json({ error: 'SME business not found.' });
    return;
  }

  const updated = { ...existing, ...(req.body as Partial<SmeBusiness>) };
  await upsertBusiness(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'sme_business.update',
    entityType: 'sme_business',
    entityId: id,
    outcome: 'success',
    summary: `SME business ${id} updated through API.`,
    metadata: { verificationStatus: updated.verificationStatus, riskLevel: updated.riskLevel },
  });
  res.json(updated);
});

app.post('/api/businesses/:id/documents', async (req, res) => {
  const { id } = req.params;
  const existing = await getBusinessById(id);
  if (!existing) {
    res.status(404).json({ error: 'SME business not found.' });
    return;
  }

  const document = req.body as BusinessDocument;
  if (!document?.id || !document.name) {
    res.status(400).json({ error: 'Business document id and name are required.' });
    return;
  }

  const updated = {
    ...existing,
    documents: [document, ...existing.documents.filter(item => item.id !== document.id)],
  };
  await upsertBusiness(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'sme_business.document_add',
    entityType: 'business_document',
    entityId: document.id,
    outcome: 'success',
    summary: `Business document ${document.name} added through API.`,
    metadata: { businessId: id, category: document.category, status: document.status },
  });
  res.status(201).json(document);
});

app.post('/api/businesses/:id/timeline', async (req, res) => {
  const { id } = req.params;
  const existing = await getBusinessById(id);
  if (!existing) {
    res.status(404).json({ error: 'SME business not found.' });
    return;
  }

  const event = req.body as BusinessTimelineEvent;
  if (!event?.id || !event.title) {
    res.status(400).json({ error: 'Business timeline event id and title are required.' });
    return;
  }

  const updated = {
    ...existing,
    timeline: [event, ...existing.timeline.filter(item => item.id !== event.id)],
  };
  await upsertBusiness(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'sme_business.timeline_add',
    entityType: 'business_timeline_event',
    entityId: event.id,
    outcome: 'success',
    summary: `Business timeline event ${event.title} added through API.`,
    metadata: { businessId: id, type: event.type },
  });
  res.status(201).json(event);
});

app.post('/api/businesses/:id/financing-requests', async (req, res) => {
  const { id } = req.params;
  const existing = await getBusinessById(id);
  if (!existing) {
    res.status(404).json({ error: 'SME business not found.' });
    return;
  }

  const request = req.body as FinancingRequest;
  if (!request?.id || !request.productName) {
    res.status(400).json({ error: 'Financing request id and product name are required.' });
    return;
  }

  const updated = {
    ...existing,
    financingRequests: [request, ...existing.financingRequests.filter(item => item.id !== request.id)],
  };
  await upsertBusiness(updated);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'sme_business.financing_request',
    entityType: 'financing_request',
    entityId: request.id,
    outcome: 'success',
    summary: `Financing request ${request.productName} added through API.`,
    metadata: { businessId: id, amount: request.amount, status: request.status },
  });
  res.status(201).json(request);
});

app.get('/api/alerts', async (_req, res) => {
  const alerts = await getAllAlerts();
  res.json(alerts);
});

app.post('/api/alerts', async (req, res) => {
  const alert = req.body as AlertNotification;
  if (!alert?.id) {
    res.status(400).json({ error: 'Alert id is required.' });
    return;
  }

  await upsertAlert(alert);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'alert.create',
    entityType: 'alert',
    entityId: alert.id,
    outcome: 'success',
    summary: `Alert ${alert.id} created through API.`,
    metadata: { type: alert.type },
  });
  res.status(201).json(alert);
});

app.get('/api/documents/:userId', async (req, res) => {
  const documents = await getDocumentsForUser(req.params.userId);
  res.json(documents);
});

app.post('/api/documents', async (req, res) => {
  const document = req.body as StoredDocumentPayload;
  if (!document?.id || !document.userId) {
    res.status(400).json({ error: 'Document id and userId are required.' });
    return;
  }

  await upsertDocument(document);
  await createAuditLog({
    id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    occurredAt: new Date().toISOString(),
    ...getActor(req),
    action: 'document.upload',
    entityType: 'document',
    entityId: document.id,
    outcome: 'success',
    summary: `Document ${document.id} uploaded through API.`,
    metadata: { category: document.category, size: document.size },
  });
  res.status(201).json({ ...document, base64: undefined });
});

app.get('/api/audit-logs', async (_req, res) => {
  const logs = await getAllAuditLogs();
  res.json(logs);
});

app.post('/api/audit-logs', async (req, res) => {
  const entry = req.body as AuditLogEntry;
  if (!entry?.id) {
    res.status(400).json({ error: 'Audit entry id is required.' });
    return;
  }

  await createAuditLog(entry);
  res.status(201).json(entry);
});

app.get('/api/intelligence/applications/:id', async (req, res) => {
  const application = await getLoanApplicationById(req.params.id);
  if (!application) {
    res.status(404).json({ error: 'Loan application not found.' });
    return;
  }

  res.json(runExpertSystem(application));
});

app.get('/api/intelligence/dashboard', async (_req, res) => {
  const [applications, repayments, customers, payrollRecords] = await Promise.all([
    getAllLoanApplications(),
    getAllRepayments(),
    getAllCustomers(),
    payrollRepository.findAllRecords(),
  ]);

  res.json({
    fraudFlags: detectFraudFlags(applications),
    segments: computeSegmentDistribution(applications),
    sectorTrends: computeDynamicSectorTrends(applications, repayments),
    dataMiningInsights: generateDynamicInsights(applications, repayments, customers, payrollRecords),
    portfolioTimeline: computeDynamicPortfolioTimeline(applications, repayments),
  });
});

app.post('/api/ai/advisor/chat', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the backend.' });
    return;
  }

  const { message, systemContext, history = [], applicationId } = req.body as {
    message?: string;
    systemContext?: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    applicationId?: string;
  };

  if (!message || !systemContext) {
    res.status(400).json({ error: 'message and systemContext are required.' });
    return;
  }

  try {
    const genai = new GoogleGenAI({ apiKey });
    const chat = genai.chats.create({
      model: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
      config: { systemInstruction: systemContext },
      history: history.map(item => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      })),
    });

    const response = await chat.sendMessage({ message });
    await createAuditLog({
      id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      occurredAt: new Date().toISOString(),
      ...getActor(req),
      action: 'ai.advisor_chat',
      entityType: 'ai_chat',
      entityId: applicationId,
      outcome: 'success',
      summary: 'AI advisor response generated through backend Gemini service.',
      metadata: { applicationId, promptLength: message.length },
    });
    res.json({ text: response.text || 'I apologise, I could not generate a response. Please try again.' });
  } catch (err: any) {
    await createAuditLog({
      id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      occurredAt: new Date().toISOString(),
      ...getActor(req),
      action: 'ai.advisor_chat_failed',
      entityType: 'ai_chat',
      entityId: applicationId,
      outcome: 'failure',
      summary: 'Backend Gemini advisor request failed.',
      metadata: { applicationId, error: err?.message || 'Unknown error' },
    });
    res.status(500).json({ error: err?.message || 'Unable to generate advisor response.' });
  }
});

// ── Dashboard Summary ────────────────────────────────────────────────────────
app.get('/api/dashboard/summary', requireAuth, async (_req, res) => {
  try {
    const summary = await getDashboardSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to compute dashboard summary.' });
  }
});

// ── Messaging: Conversations ────────────────────────────────────────────────
app.get('/api/conversations', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const rows = await listConversations(auth.userId);
  res.json(rows);
});

app.post('/api/conversations', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const { staffId } = req.body as { staffId?: string };
  if (!staffId) { res.status(400).json({ error: 'staffId is required.' }); return; }
  const conv = await getOrCreateConversation(auth.userId, staffId);
  res.json(conv);
});

// ── Messaging: Messages ────────────────────────────────────────────────────────
app.get('/api/conversations/:convId/messages', requireAuth, async (req, res) => {
  const { convId } = req.params;
  const after = req.query.after as string | undefined;
  const messages = await getMessages(convId, after);
  res.json(messages);
});

app.post('/api/conversations/:convId/messages', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const { convId } = req.params;
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: 'Message content is required.' }); return; }
  const msg = await createMessage(
    `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    convId,
    auth.userId,
    content.trim()
  );
  res.status(201).json(msg);
});

app.post('/api/conversations/:convId/read', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  await markMessagesRead(req.params.convId, auth.userId);
  res.status(204).end();
});

// ── Staff Management ──────────────────────────────────────────────────────────
app.get('/api/admin/staff', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  if (auth.role !== 'admin') { res.status(403).json({ error: 'Admin access required.' }); return; }
  const staff = await listStaffUsers();
  res.json(staff);
});

app.post('/api/admin/staff', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  if (auth.role !== 'admin') { res.status(403).json({ error: 'Admin access required.' }); return; }
  const { fullName, email, password, phone, staffTitle } = req.body as {
    fullName?: string; email?: string; password?: string; phone?: string; staffTitle?: string;
  };
  if (!fullName || !email || !password) {
    res.status(400).json({ error: 'fullName, email and password are required.' });
    return;
  }
  const existing = await getUserByEmail(email);
  if (existing) { res.status(409).json({ error: 'An account with this email already exists.' }); return; }

  const passwordHash = await hashSecret(password);
  const newStaff: StoredUser = {
    id: `staff-${Date.now()}`,
    role: staffTitle === 'Risk Manager' || staffTitle === 'Branch Manager' ? 'manager' : 'loan_officer',
    fullName,
    email,
    phone: phone || '',
    address: 'Pinnacle MFI',
    nationalId: `STAFF-${Date.now()}`,
    dob: '',
    gender: '',
    employmentType: 'Employed',
    employer: 'Pinnacle MFI',
    monthlyIncome: '0',
    customerType: 'individual',
    passwordHash,
    securityQuestion: 'What is your staff ID?',
    securityAnswerHash: await hashSecret(normalizeSecurityAnswer(staffTitle || 'staff')),
    createdAt: new Date().toISOString(),
    notificationPrefs: { sms: true, email: true, push: true },
  };
  await createStaffUser(newStaff);
  const { passwordHash: _ph, securityAnswerHash: _sah, ...safe } = newStaff;
  res.status(201).json(safe);
});

app.patch('/api/admin/staff/:id', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  if (auth.role !== 'admin') { res.status(403).json({ error: 'Admin access required.' }); return; }
  try {
    const updated = await updateStaffUser(req.params.id, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

// ── Password Change ───────────────────────────────────────────────────────────
app.post('/api/auth/change-password', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string; newPassword?: string;
  };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'currentPassword and newPassword are required.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters.' });
    return;
  }
  const user = await getUserById(auth.userId);
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }
  const currentCheck = await verifySecret(currentPassword, user.passwordHash);
  if (!currentCheck.valid) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }
  const newHash = await hashSecret(newPassword);
  await upsertUser({ ...user, passwordHash: newHash });
  res.json({ success: true, message: 'Password changed successfully.' });
});

// ── Document Upload: Real File Storage ─────────────────────────────────────────
app.post('/api/documents/upload', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const { file, category } = req.body as { file?: string; category?: string };
  
  if (!file || !category) {
    res.status(400).json({ error: 'file (base64) and category are required.' });
    return;
  }
  
  try {
    // Create documents directory structure
    const docsDir = path.join(process.cwd(), 'server', 'data', 'documents');
    const userDir = path.join(docsDir, auth.userId);
    await mkdir(userDir, { recursive: true });
    
    // Decode base64 and save to disk
    const buffer = Buffer.from(file.split(',')[1] || file, 'base64');
    const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fileName = `${docId}.bin`; // Generic binary name
    const filePath = path.join(userDir, fileName);
    
    fs.writeFileSync(filePath, buffer);
    
    const fileSize = buffer.length;
    const fileSizeStr = fileSize > 1048576
      ? `${(fileSize / 1048576).toFixed(1)} MB`
      : `${(fileSize / 1024).toFixed(0)} KB`;
    
    // Create audit log
    await createAuditLog({
      id: `audit-api-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      occurredAt: new Date().toISOString(),
      actorId: auth.userId,
      actorName: auth.fullName,
      actorRole: auth.role,
      action: 'document.upload_real',
      entityType: 'document',
      entityId: docId,
      outcome: 'success',
      summary: `Real document file uploaded for category ${category}.`,
      metadata: { category, fileSize, fileName },
    });
    
    res.status(201).json({
      id: docId,
      fileName,
      fileSize: fileSizeStr,
      uploadedAt: new Date().toISOString(),
      category,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Document upload failed: ${err?.message || 'Unknown error'}` });
  }
});

// ── Document Download: Retrieve Uploaded Files ─────────────────────────────────
app.get('/api/documents/:docId/download', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  const { docId } = req.params;
  
  try {
    // Search for document file
    const docsDir = path.join(process.cwd(), 'server', 'data', 'documents', auth.userId);
    const fileName = `${docId}.bin`;
    const filePath = path.join(docsDir, fileName);
    
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileBuffer);
  } catch (err: any) {
    res.status(500).json({ error: `Download failed: ${err?.message || 'Unknown error'}` });
  }
});

// ── CSV Report Export ──────────────────────────────────────────────────────────
function toCSV(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [
    keys.join(','),
    ...rows.map(row => keys.map(k => escape(row[k])).join(',')),
  ].join('\n');
}

app.get('/api/reports/export', requireAuth, async (req, res) => {
  const auth = (req as AuthenticatedRequest).auth!;
  if (auth.role === 'customer') { res.status(403).json({ error: 'Staff access required.' }); return; }
  const type = (req.query.type as string) || 'portfolio';

  try {
    if (type === 'portfolio') {
      const apps = await getAllLoanApplications();
      const csv = toCSV(apps.map(a => ({
        id: a.id, applicantName: a.applicantName, email: a.email, phone: a.phone,
        amount: a.amount, status: a.status, sector: a.sector, score: a.score,
        riskLevel: a.riskLevel, date: a.date,
      })));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="portfolio_report.csv"');
      res.send(csv);
    } else if (type === 'audit') {
      const logs = await getAllAuditLogs();
      const csv = toCSV(logs.map(l => ({
        id: l.id, occurredAt: l.occurredAt, actorName: l.actorName, actorRole: l.actorRole,
        action: l.action, entityType: l.entityType, outcome: l.outcome, summary: l.summary,
      })));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit_trail.csv"');
      res.send(csv);
    } else if (type === 'repayments') {
      const reps = await getAllRepayments();
      const csv = toCSV(reps.map(r => ({
        id: r.id, installmentNumber: r.installmentNumber, dueDate: r.dueDate,
        amount: r.amount, status: r.status,
      })));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="repayments_report.csv"');
      res.send(csv);
    } else {
      res.status(400).json({ error: 'Unknown report type. Use: portfolio, audit, repayments.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Export failed.' });
  }
});

// ── Health Check & Container Probes ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const mode = getStorageMode();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    storageMode: mode,
    database: mode === 'postgres' ? 'PostgreSQL Production Cluster' : 'File-backed Local Persistence Store',
    version: '1.0.0',
  });
});

app.get('/api/health/liveness', (_req, res) => {
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() });
});

app.get('/api/health/readiness', async (_req, res) => {
  try {
    const mode = getStorageMode();
    res.status(200).json({
      status: 'ready',
      storageMode: mode,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({ status: 'not_ready', error: err?.message || 'Storage check failed' });
  }
});

// ── Serve Frontend Static Assets in Production ────────────────────────────────
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Fallback to index.html for React Router SPA paths
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

(async () => {
  await ensureSchema();
  await seedInitialData();
  app.listen(port, () => {
    console.log(`Pinnacle API listening on http://localhost:${port}`);
  });
})();




