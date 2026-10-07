import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  login as authLogin,
  logout as authLogout,
  register as authRegister,
  getCurrentSession,
  seedStaffAccount,
  type Session,
  type RegisterPayload,
} from './authService';
import { seedIfNeeded } from '../lib/store';
import { themeStore } from '../lib/store';
import { recordAuditEvent } from '../lib/auditTrail';
import { PSA_UNAUTHORIZED_EVENT } from '../lib/apiClient';

interface AuthContextValue {
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  login: (email: string, password: string, remember: boolean) => Promise<{ success: boolean; session?: Session; error?: string }>;
  logout: () => void;
  register: (payload: RegisterPayload) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Auto-logout when any API call returns 401 (expired / invalid token)
  useEffect(() => {
    const handleUnauthorized = () => {
      authLogout();
      setSession(null);
    };
    window.addEventListener(PSA_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(PSA_UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  useEffect(() => {
    let active = true;

    (async () => {
      seedIfNeeded();
      await seedStaffAccount();

      if (!active) return;
      const existing = getCurrentSession();
      setSession(existing);

      const savedTheme = themeStore.get();
      setTheme(savedTheme);
      themeStore.init();

      setIsLoading(false);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session) return;

    const expiresAt = Date.parse(session.expiresAt);
    if (Number.isNaN(expiresAt) || expiresAt <= Date.now()) {
      authLogout();
      setSession(null);
      return;
    }

    const timeout = window.setTimeout(() => {
      authLogout();
      setSession(null);
    }, expiresAt - Date.now());

    return () => window.clearTimeout(timeout);
  }, [session?.expiresAt]);
  const login = useCallback(async (email: string, password: string, remember: boolean) => {
    const result = await authLogin(email, password, remember);
    if (result.success && result.session) {
      setSession(result.session);
      recordAuditEvent({
        actorId: result.session.userId,
        actorName: result.session.fullName,
        actorRole: result.session.role,
        action: 'auth.login',
        entityType: 'session',
        entityId: result.session.userId,
        outcome: 'success',
        summary: `${result.session.fullName} signed in to the ${result.session.role} portal.`,
        metadata: { remember },
      });
    } else {
      recordAuditEvent({
        actorId: 'anonymous',
        actorName: email || 'Unknown user',
        actorRole: 'system',
        action: 'auth.login_failed',
        entityType: 'session',
        outcome: 'failure',
        summary: `Failed login attempt for ${email || 'unknown email'}.`,
        metadata: { email },
      });
    }
    return { success: result.success, session: result.session, error: result.error };
  }, []);

  const logout = useCallback(() => {
    if (session) {
      recordAuditEvent({
        actorId: session.userId,
        actorName: session.fullName,
        actorRole: session.role,
        action: 'auth.logout',
        entityType: 'session',
        entityId: session.userId,
        outcome: 'success',
        summary: `${session.fullName} signed out.`,
      });
    }
    authLogout();
    setSession(null);
  }, [session]);

  const register = useCallback(async (payload: RegisterPayload) => {
    const result = await authRegister(payload);
    recordAuditEvent({
      actorId: 'self-registration',
      actorName: payload.fullName || payload.email,
      actorRole: 'client',
      action: result.success ? 'auth.register' : 'auth.register_failed',
      entityType: 'user',
      outcome: result.success ? 'success' : 'failure',
      summary: result.success
        ? `New ${payload.customerType} account registered for ${payload.fullName}.`
        : `Registration failed for ${payload.email}.`,
      metadata: { email: payload.email, customerType: payload.customerType },
    });
    return result;
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    themeStore.set(next);
  }, [theme]);

  return (
    <AuthContext.Provider value={{
      session,
      isAuthenticated: !!session,
      isLoading,
      theme,
      toggleTheme,
      login,
      logout,
      register,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
