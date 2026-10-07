import { apiRequest, hasApiBackend } from '../lib/apiClient';
import type { StoredUser, UserRole } from '../types';
import { generateUserMockBundle } from '../lib/mockDataGenerator';
import {
  applicationsStore,
  repaymentsStore,
  alertsStore,
  customersStore,
  businessesStore,
} from '../lib/store';


export interface Session {
  userId: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  address?: string;
  monthlyIncome?: string;
  customerType: 'individual' | 'sme';
  createdAt: string;
  expiresAt: string;
  staffTitle?: string;
}

export type UserProfile = Omit<StoredUser, 'passwordHash' | 'securityAnswerHash'>;

interface AuthResponse {
  session: Session;
  token: string;
}

interface ResetTokenResponse {
  resetToken: string;
  expiresAt: string;
}

const LOCAL_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const REMEMBER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const localResetTokens = new Map<string, { email: string; expiresAt: number }>();

const KEYS = {
  USERS: 'psa_users',
  SESSION: 'psa_session',
  TOKEN: 'psa_auth_token',
} as const;

function getSessionStorage(): Storage | null {
  if (localStorage.getItem(KEYS.SESSION)) return localStorage;
  if (sessionStorage.getItem(KEYS.SESSION)) return sessionStorage;
  return null;
}

function persistAuth(session: Session, token: string | null, remember: boolean): void {
  const storage = remember ? localStorage : sessionStorage;
  const otherStorage = remember ? sessionStorage : localStorage;
  storage.setItem(KEYS.SESSION, JSON.stringify(session));
  otherStorage.removeItem(KEYS.SESSION);

  if (token) {
    storage.setItem(KEYS.TOKEN, token);
    otherStorage.removeItem(KEYS.TOKEN);
  } else {
    localStorage.removeItem(KEYS.TOKEN);
    sessionStorage.removeItem(KEYS.TOKEN);
  }
}

function persistSessionOnly(session: Session): void {
  const storage = getSessionStorage() ?? localStorage;
  const otherStorage = storage === localStorage ? sessionStorage : localStorage;
  storage.setItem(KEYS.SESSION, JSON.stringify(session));
  otherStorage.removeItem(KEYS.SESSION);
}

function getStoredAuthToken(): string | null {
  return localStorage.getItem(KEYS.TOKEN) || sessionStorage.getItem(KEYS.TOKEN);
}

function createLocalSessionExpiry(remember: boolean): string {
  const ttl = remember ? REMEMBER_SESSION_TTL_MS : LOCAL_SESSION_TTL_MS;
  return new Date(Date.now() + ttl).toISOString();
}

function isSessionExpired(session: Session): boolean {
  const expiresAt = Date.parse(session.expiresAt);
  return Number.isNaN(expiresAt) || expiresAt <= Date.now();
}

function createLocalResetToken(email: string): ResetTokenResponse {
  const resetToken = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = Date.now() + RESET_TOKEN_TTL_MS;
  localResetTokens.set(resetToken, { email, expiresAt });
  return { resetToken, expiresAt: new Date(expiresAt).toISOString() };
}

function consumeLocalResetToken(resetToken: string): string | null {
  const record = localResetTokens.get(resetToken);
  if (!record || record.expiresAt <= Date.now()) {
    localResetTokens.delete(resetToken);
    return null;
  }
  localResetTokens.delete(resetToken);
  return record.email;
}

// Browser-only demo hashing; the API backend stores passwords with bcrypt.
async function simpleHash(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'psa_salt_v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function getUsers(): StoredUser[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS.USERS) || '[]');
  } catch { return []; }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(KEYS.USERS, JSON.stringify(users));
}

// ── Seed default staff accounts on first run ──────────────────────────────────
export async function seedStaffAccount(): Promise<void> {
  if (hasApiBackend()) return;

  const users = getUsers();
  const alreadySeeded = users.some(u => u.email === 'admin@pinnacle.mw');
  if (alreadySeeded) return;

  const passwordHash = await simpleHash('PINACO@2026');
  const answerHash = await simpleHash('lilongwe');

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

  saveUsers([...users, ...demoStaff]);
}

// ── Register ─────────────────────────────────────────────────────────────────
export interface RegisterPayload {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  nationalId: string;
  dob: string;
  gender: string;
  employmentType: string;
  employer: string;
  monthlyIncome: string;
  customerType: 'individual' | 'sme';
  password: string;
  securityQuestion: string;
  securityAnswer: string;
}

export async function register(payload: RegisterPayload): Promise<{ success: boolean; error?: string }> {
  if (hasApiBackend()) {
    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Registration failed.' };
    }
  }

  const users = getUsers();
  if (users.some(u => u.email.toLowerCase() === payload.email.toLowerCase())) {
    return { success: false, error: 'An account with this email already exists.' };
  }

  const passwordHash = await simpleHash(payload.password);
  const answerHash = await simpleHash(payload.securityAnswer.toLowerCase().trim());

  const newUser: StoredUser = {
    id: `client-${Date.now()}`,
    role: 'customer',
    fullName: payload.fullName,
    email: payload.email.toLowerCase(),
    phone: payload.phone,
    address: payload.address,
    nationalId: payload.nationalId,
    dob: payload.dob,
    gender: payload.gender,
    employmentType: payload.employmentType,
    employer: payload.employer,
    monthlyIncome: payload.monthlyIncome,
    customerType: payload.customerType,
    passwordHash,
    securityQuestion: payload.securityQuestion,
    securityAnswerHash: answerHash,
    createdAt: new Date().toISOString(),
    notificationPrefs: { sms: true, email: true, push: true },
  };

  saveUsers([...users, newUser]);

  // Generate dynamic, realistic, personalized portfolio for local demo mode
  const bundle = generateUserMockBundle(newUser);
  customersStore.add(bundle.customer);
  bundle.applications.forEach(a => applicationsStore.add(a));
  repaymentsStore.addMultiple(bundle.repayments);
  bundle.alerts.forEach(a => alertsStore.add(a));
  if (bundle.business) {
    businessesStore.add(bundle.business);
  }

  return { success: true };
}

// ── Login ─────────────────────────────────────────────────────────────────────
export async function login(
  email: string,
  password: string,
  remember: boolean
): Promise<{ success: boolean; session?: Session; error?: string }> {
  if (hasApiBackend()) {
    try {
      const result = await apiRequest<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const session = result.session;
      persistAuth(session, result.token, remember);
      return { success: true, session };
    } catch (error: any) {
      try {
        const v1Result = await apiRequest<AuthResponse>('/api/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        const session = v1Result.session;
        persistAuth(session, v1Result.token || (v1Result as any).accessToken, remember);
        return { success: true, session };
      } catch (err: any) {
        console.warn('API login failed, checking local demo accounts:', err?.message);
        // Fall through to check local demo accounts below
      }
    }
  }

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'No account found with this email address.' };

  const hash = await simpleHash(password);
  if (hash !== user.passwordHash) return { success: false, error: 'Incorrect password. Please try again.' };

  const session: Session = {
    userId: user.id,
    role: user.role,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    customerType: user.customerType,
    createdAt: user.createdAt,
    expiresAt: createLocalSessionExpiry(remember),
    staffTitle: user.staffTitle,
  };

  persistAuth(session, null, remember);

  return { success: true, session };
}

// ── Get current session ───────────────────────────────────────────────────────
export function getCurrentSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEYS.SESSION) || sessionStorage.getItem(KEYS.SESSION);
    if (!raw) return null;
    if (hasApiBackend() && !getStoredAuthToken()) {
      logout();
      return null;
    }
    const session = JSON.parse(raw) as Session;
    if (isSessionExpired(session)) {
      logout();
      return null;
    }
    return session;
  } catch { return null; }
}

// ── Get full user profile ─────────────────────────────────────────────────────
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  if (hasApiBackend()) {
    try {
      return await apiRequest<UserProfile>(`/api/auth/profile/${encodeURIComponent(userId)}`);
    } catch {
      return null;
    }
  }

  return getUsers().find(u => u.id === userId) ?? null;
}

// ── Update profile ────────────────────────────────────────────────────────────
export async function updateUserProfile(userId: string, patch: Partial<StoredUser>): Promise<void> {
  if (hasApiBackend()) {
    const updated = await apiRequest<UserProfile>(`/api/auth/profile/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    const session = getCurrentSession();
    if (session && session.userId === userId) {
      const updatedSession = {
        ...session,
        ...(updated.fullName ? { fullName: updated.fullName } : {}),
        ...(updated.email ? { email: updated.email } : {}),
        ...(updated.phone ? { phone: updated.phone } : {}),
      };
      persistSessionOnly(updatedSession);
    }
    return;
  }

  const users = getUsers().map(u => u.id === userId ? { ...u, ...patch } : u);
  saveUsers(users);
  // Refresh session name/email if changed
  const session = getCurrentSession();
  if (session && session.userId === userId) {
    const updated = { ...session, ...('fullName' in patch ? { fullName: patch.fullName } : {}), ...('email' in patch ? { email: patch.email } : {}), ...('phone' in patch ? { phone: patch.phone } : {}) };
    persistSessionOnly(updated);
  }
}

// ── Logout ────────────────────────────────────────────────────────────────────
export function logout(): void {
  localStorage.removeItem(KEYS.SESSION);
  sessionStorage.removeItem(KEYS.SESSION);
  localStorage.removeItem(KEYS.TOKEN);
  sessionStorage.removeItem(KEYS.TOKEN);
}

// ── Forgot Password — step 1: find account & return security question ─────────
export async function getSecurityQuestion(email: string): Promise<string | null> {
  if (hasApiBackend()) {
    try {
      const { securityQuestion } = await apiRequest<{ securityQuestion: string }>('/api/auth/forgot-password/question', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      return securityQuestion;
    } catch {
      return null;
    }
  }

  const user = getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  return user?.securityQuestion ?? null;
}

// ── Forgot Password — step 2: verify answer & issue reset token ──────────────
export async function verifySecurityAnswer(
  email: string,
  securityAnswer: string
): Promise<{ success: boolean; resetToken?: string; expiresAt?: string; error?: string }> {
  if (hasApiBackend()) {
    try {
      const result = await apiRequest<ResetTokenResponse>('/api/auth/forgot-password/verify', {
        method: 'POST',
        body: JSON.stringify({ email, securityAnswer }),
      });
      return { success: true, resetToken: result.resetToken, expiresAt: result.expiresAt };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Verification failed.' };
    }
  }

  const user = getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'No account found with this email.' };

  const answerHash = await simpleHash(securityAnswer.toLowerCase().trim());
  if (answerHash !== user.securityAnswerHash) {
    return { success: false, error: 'Incorrect security answer.' };
  }

  return { success: true, ...createLocalResetToken(user.email) };
}

// ── Forgot Password — step 3: reset password with token ──────────────────────
export async function resetPassword(
  resetToken: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  if (hasApiBackend()) {
    try {
      await apiRequest('/api/auth/forgot-password/reset', {
        method: 'POST',
        body: JSON.stringify({ resetToken, newPassword }),
      });
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Reset failed.' };
    }
  }

  const email = consumeLocalResetToken(resetToken);
  if (!email) return { success: false, error: 'Password reset token is invalid or expired.' };

  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return { success: false, error: 'No account found with this email.' };

  const passwordHash = await simpleHash(newPassword);
  saveUsers(users.map(u => u.email === user.email ? { ...u, passwordHash } : u));
  return { success: true };
}

