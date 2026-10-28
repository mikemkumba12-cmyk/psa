import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore, UNAUTHORIZED_EVENT } from '../api/client';
import type { Profile, SessionResponse } from '../api/types';

interface AuthState {
  profile: Profile | null;
  loading: boolean;
  /** Stores a session returned by login, registration, activation or passkey sign-in. */
  startSession: (session: SessionResponse, remember?: boolean) => void;
  /** Replaces the token after a password change (the server issues a new one). */
  replaceToken: (token: string) => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!tokenStore.get()) {
      setProfile(null);
      return;
    }
    try {
      setProfile(await api<Profile>('/api/auth/me'));
    } catch {
      tokenStore.clear();
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  useEffect(() => {
    const onUnauthorized = () => {
      tokenStore.clear();
      setProfile(null);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const startSession = useCallback((session: SessionResponse, remember = false) => {
    tokenStore.set(session.token, remember);
    setProfile(session.profile);
  }, []);

  const replaceToken = useCallback((token: string) => tokenStore.replace(token), []);

  const logout = useCallback(async () => {
    try {
      await api('/api/auth/logout', { method: 'POST' });
    } catch {
      /* the session may already be gone */
    }
    tokenStore.clear();
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(() => ({
    profile,
    loading,
    startSession,
    replaceToken,
    refreshProfile,
    logout,
    can: (permission: string) => Boolean(profile?.permissions.includes(permission)),
    isStaff: Boolean(profile && profile.role !== 'customer'),
  }), [profile, loading, startSession, replaceToken, refreshProfile, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
