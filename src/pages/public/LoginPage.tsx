import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Fingerprint } from 'lucide-react';
import { browserSupportsWebAuthn, startAuthentication } from '@simplewebauthn/browser';
import { api, ApiError } from '../../api/client';
import type { SessionResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Checkbox, FormErrorSummary, PasswordInput, TextInput } from '../../ui/Form';
import { AuthShell } from './AuthShell';

export function LoginPage({ staff }: { staff?: boolean }) {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState<'password' | 'passkey' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => { setPasskeySupported(browserSupportsWebAuthn()); }, []);

  const finish = (session: SessionResponse) => {
    startSession(session, remember);
    const from = (location.state as { from?: string } | null)?.from;
    const home = session.profile.role === 'customer' ? '/client' : '/staff';
    navigate(from && from.startsWith(home) ? from : home, { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending('password');
    setError(null);
    try {
      finish(await api<SessionResponse>('/api/auth/login', { body: { email, password } }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed.');
    } finally {
      setPending(null);
    }
  };

  const signInWithPasskey = async () => {
    setPending('passkey');
    setError(null);
    try {
      const { challengeId, options } = await api<{ challengeId: string; options: any }>('/api/auth/passkeys/login/options', { method: 'POST' });
      const response = await startAuthentication({ optionsJSON: options });
      finish(await api<SessionResponse>('/api/auth/passkeys/login/verify', { body: { challengeId, response } }));
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
      <form onSubmit={submit} className="space-y-4" noValidate>
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
    </AuthShell>
  );
}
