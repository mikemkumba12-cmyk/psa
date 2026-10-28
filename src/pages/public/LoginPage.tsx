import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { api, ApiError, getApiBaseUrl } from '../../api/client';
import type { SessionResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button, ButtonLink } from '../../ui/Button';
import { Alert } from '../../ui/Feedback';
import { Checkbox, FormErrorSummary, PasswordInput, TextInput } from '../../ui/Form';
import { AuthShell } from './AuthShell';

export function LoginPage({ staff }: { staff?: boolean }) {
  const { startSession, profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [customerOnStaffPage, setCustomerOnStaffPage] = useState(false);

  useEffect(() => { setPasskeySupported(browserSupportsWebAuthn()); }, []);

  const finish = async (session: SessionResponse) => {
    // The staff page signs staff in only. A customer account gets a clear message instead of
    // being silently sent to the customer portal, and the session just created is ended.
    if (staff && session.profile.role === 'customer') {
      await fetch(`${getApiBaseUrl()}/api/auth/logout`, { method: 'POST', headers: { Authorization: `Bearer ${session.token}` } }).catch(() => undefined);
      setPassword('');
      setCustomerOnStaffPage(true);
      return;
    }
    startSession(session, remember);
    const from = (location.state as { from?: string } | null)?.from;
    const home = session.profile.role === 'customer' ? '/client' : '/staff';
    navigate(from && from.startsWith(home) ? from : home, { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending('password');
    setError(null);
    setCustomerOnStaffPage(false);
    try {
      await finish(await api<SessionResponse>('/api/auth/login', { body: { email, password } }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed.');
    } finally {
      setPending(null);
    }
  };

  const signInWithPasskey = async () => {
    setPending('passkey');
    setError(null);
    setCustomerOnStaffPage(false);
    try {
      const { challengeId, options } = await api<{ challengeId: string; options: any }>('/api/auth/passkeys/login/options', { method: 'POST' });
      const response = await startAuthentication({ optionsJSON: options });
      await finish(await api<SessionResponse>('/api/auth/passkeys/login/verify', { body: { challengeId, response } }));
    } catch (caught: any) {
      if (caught?.name === 'NotAllowedError') setError('Passkey sign-in was cancelled.');
      else setError(caught instanceof ApiError ? caught.message : 'Passkey sign-in did not work on this device.');
    } finally {
      setPending(null);
    }
  };

  return (
    <AuthShell
      title={staff ? 'Staff sign in' : 'Sign in'}
      subtitle={staff ? 'For Pinnacle employees.' : 'Track your applications and loans.'}
      footer={staff
        ? <Link className="font-semibold text-brand-700 hover:underline" to="/login">Customer sign in</Link>
        : <>New here? <Link className="font-semibold text-brand-700 hover:underline" to="/register">Create an account</Link> · <Link className="font-semibold text-brand-700 hover:underline" to="/activate">Activate an existing client account</Link></>}
    >
      {staff && profile?.role === 'customer' ? (
        <div className="space-y-4">
          <Alert tone="info" title="You’re signed in with a customer account">
            This page is for Pinnacle staff. To use a staff account, sign out first.
          </Alert>
          <div className="flex flex-col gap-2 sm:flex-row">
            <ButtonLink to="/client" variant="secondary" className="sm:flex-1">Go to my customer portal</ButtonLink>
            <Button className="sm:flex-1" onClick={() => { void logout(); }}>Sign out</Button>
          </div>
        </div>
      ) : (<>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {customerOnStaffPage && (
          <Alert tone="warning" title="This is a customer account">
            Staff accounts are created by an administrator. To sign in as a customer, use the{' '}
            <Link className="font-semibold underline" to="/login">customer sign-in page</Link>.
          </Alert>
        )}
        <FormErrorSummary message={error ?? undefined} />
        <TextInput label="Email" type="email" autoComplete="username webauthn" required value={email} onChange={event => setEmail(event.target.value)} />
        <PasswordInput label="Password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label="Keep me signed in on this device" checked={remember} onChange={setRemember} />
          <Link to="/forgot-password" className="text-sm font-semibold text-brand-700 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={pending === 'password'} disabled={Boolean(pending) || !email || !password}>Sign in</Button>
      </form>
      {passkeySupported && (
        <>
          <div className="my-5 flex items-center gap-3 text-xs text-ink-subtle"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
          <Button variant="secondary" block size="lg" icon={<Fingerprint className="h-5 w-5" />} loading={pending === 'passkey'} disabled={Boolean(pending)} onClick={signInWithPasskey}>
            Sign in with a passkey
          </Button>
          <p className="mt-2 text-center text-xs text-ink-subtle">Uses your device’s fingerprint, face or PIN. Set it up in Settings after signing in.</p>
        </>
      )}
      </>)}
    </AuthShell>
  );
}
