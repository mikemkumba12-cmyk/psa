import React, { useEffect, useState } from 'react';
import { Fingerprint, KeyRound, Laptop, Trash2 } from 'lucide-react';
import { browserSupportsWebAuthn, platformAuthenticatorIsAvailable, startRegistration } from '@simplewebauthn/browser';
import { api, ApiError } from '../../api/client';
import type { Profile } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { date, dateTime, relative } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, StatusBadge } from '../../ui/Feedback';
import { Checkbox, FormErrorSummary, FormGrid, MoneyInput, PasswordInput, TextInput } from '../../ui/Form';
import { Card, DescriptionList, PageHeader, Tabs } from '../../ui/Layout';
import { ConfirmDialog } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

type Tab = 'profile' | 'security' | 'notifications';

export function SettingsPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>(profile?.mustChangePassword ? 'security' : 'profile');
  if (!profile) return null;
  return (
    <>
      <PageHeader title="Settings" />
      {profile.mustChangePassword && <div className="mb-4"><Alert tone="warning" title="Choose your own password">You signed in with a temporary password. Change it to continue.</Alert></div>}
      <Tabs label="Settings sections" value={tab} onChange={setTab} tabs={[
        { id: 'profile', label: 'Profile' }, { id: 'security', label: 'Sign-in & security' }, { id: 'notifications', label: 'Notifications' },
      ]} />
      {tab === 'profile' && <ProfileSection profile={profile} />}
      {tab === 'security' && <SecuritySection profile={profile} />}
      {tab === 'notifications' && <NotificationSection profile={profile} />}
    </>
  );
}

function ProfileSection({ profile }: { profile: Profile }) {
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const customer = profile.customer;
  const [form, setForm] = useState({
    phone: profile.phone ?? '', address: customer?.address ?? '', district: customer?.district ?? '',
    employmentType: customer?.employmentType ?? '', employerName: customer?.employerName ?? '', monthlyIncome: customer?.monthlyIncome ?? ('' as number | ''),
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [memberNumber, setMemberNumber] = useState('');

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const body: Record<string, unknown> = { phone: form.phone };
    if (customer) Object.assign(body, { address: form.address, district: form.district, employmentType: form.employmentType, employerName: form.employerName, ...(form.monthlyIncome !== '' ? { monthlyIncome: form.monthlyIncome } : {}) });
    try {
      await api('/api/auth/me', { method: 'PATCH', body });
      await refreshProfile();
      toast('Profile saved.');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };

  const claimMembership = async () => {
    try {
      await api('/api/members/claim', { body: { memberNumber } });
      await refreshProfile();
      toast('Member number sent for verification.');
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not submit.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <Card title="Identity" description="These details can only be changed by Pinnacle staff.">
        <DescriptionList columns={3} items={[
          { label: 'Name', value: profile.fullName },
          { label: 'Email', value: profile.email },
          customer && { label: 'National ID', value: customer.nationalId },
          customer?.dateOfBirth && { label: 'Date of birth', value: date(customer.dateOfBirth) },
          profile.staffTitle && { label: 'Title', value: profile.staffTitle },
        ]} />
      </Card>
      {customer && (
        <Card title="Membership" description="Business financing is for eligible members. Staff confirm your member number against the register.">
          {customer.membership ? (
            <DescriptionList items={[
              { label: 'Member number', value: customer.membership.memberNumber },
              { label: 'Status', value: <StatusBadge status={customer.membership.status} /> },
              { label: 'Member since', value: date(customer.membership.joinedOn) },
              { label: 'Verified', value: customer.membership.verifiedAt ? date(customer.membership.verifiedAt) : 'Awaiting verification' },
            ]} />
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextInput label="Your member number" value={memberNumber} onChange={event => setMemberNumber(event.target.value)} fieldClassName="sm:w-64" />
              <Button variant="secondary" disabled={memberNumber.trim().length < 2} onClick={claimMembership}>Submit for verification</Button>
            </div>
          )}
        </Card>
      )}
      <Card title="Contact and work details">
        <form onSubmit={save} className="space-y-4">
          <FormErrorSummary message={error?.message} details={error?.details} />
          <FormGrid>
            <TextInput label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
            {customer && <TextInput label="District" value={form.district} onChange={event => setForm({ ...form, district: event.target.value })} />}
            {customer && <TextInput label="Address" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} fieldClassName="md:col-span-2" />}
            {customer && <TextInput label="Employment" value={form.employmentType} onChange={event => setForm({ ...form, employmentType: event.target.value })} />}
            {customer && <TextInput label="Employer" value={form.employerName} onChange={event => setForm({ ...form, employerName: event.target.value })} />}
            {customer && <MoneyInput label="Monthly net income" value={form.monthlyIncome} onValueChange={value => setForm({ ...form, monthlyIncome: value })} />}
          </FormGrid>
          <div className="flex justify-end"><Button type="submit" loading={pending}>Save</Button></div>
        </form>
      </Card>
    </div>
  );
}

function SecuritySection({ profile }: { profile: Profile }) {
  const { replaceToken, refreshProfile } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const sessions = useResource<Array<{ id: string; current: boolean; authMethod: string; userAgent: string | null; ipAddress: string | null; createdAt: string; lastSeenAt: string }>>('/api/auth/sessions');
  const passkeys = useResource<Array<{ id: string; label: string; deviceType: string | null; createdAt: string; lastUsedAt: string | null }>>('/api/auth/passkeys');
  const [support, setSupport] = useState<{ webauthn: boolean; platform: boolean } | null>(null);
  const [removeKey, setRemoveKey] = useState<string | null>(null);

  useEffect(() => {
    const webauthn = browserSupportsWebAuthn();
    if (!webauthn) { setSupport({ webauthn, platform: false }); return; }
    platformAuthenticatorIsAvailable().then(platform => setSupport({ webauthn, platform })).catch(() => setSupport({ webauthn, platform: false }));
  }, []);

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) { setError(new ApiError(0, 'The new passwords do not match.', [{ field: 'confirm', message: 'Does not match.' }])); return; }
    setPending(true);
    setError(null);
    try {
      const result = await api<{ token: string; message: string }>('/api/auth/change-password', { body: { currentPassword: current, newPassword: next } });
      replaceToken(result.token);
      await refreshProfile();
      setCurrent(''); setNext(''); setConfirm('');
      toast(result.message);
      void sessions.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not change the password.'));
    } finally {
      setPending(false);
    }
  };

  const addPasskey = async () => {
    try {
      const { challengeId, options } = await api<{ challengeId: string; options: any }>('/api/auth/passkeys/register/options', { method: 'POST' });
      const response = await startRegistration({ optionsJSON: options });
      const label = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone / iPad' : /Android/.test(navigator.userAgent) ? 'Android phone' : /Mac/.test(navigator.userAgent) ? 'Mac' : /Windows/.test(navigator.userAgent) ? 'Windows device' : 'This device';
      await api('/api/auth/passkeys/register/verify', { body: { challengeId, response, label } });
      toast('Passkey added. You can now sign in with your fingerprint, face or device PIN.');
      await passkeys.reload();
      await refreshProfile();
    } catch (caught: any) {
      if (caught?.name === 'NotAllowedError') return;
      if (caught?.name === 'InvalidStateError') { toast('This device already has a passkey for your account.', 'error'); return; }
      toast(caught instanceof ApiError ? caught.message : caught?.message || 'Could not add a passkey.', 'error');
    }
  };

  const fieldErrors = error?.fieldErrors() ?? {};
  return (
    <div className="space-y-6">
      <Card title="Change password" description={profile.passwordChangedAt ? `Last changed ${relative(profile.passwordChangedAt)}.` : undefined}>
        <form onSubmit={changePassword} className="max-w-xl space-y-4">
          <FormErrorSummary message={error?.message} details={error?.details} visibleFields={['currentPassword', 'newPassword', 'confirm']} />
          <PasswordInput label="Current password" autoComplete="current-password" required value={current} onChange={event => setCurrent(event.target.value)} error={fieldErrors.currentPassword} />
          <PasswordInput label="New password" autoComplete="new-password" required value={next} onChange={event => setNext(event.target.value)} error={fieldErrors.newPassword} rules={{ email: profile.email }} />
          <PasswordInput label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} error={fieldErrors.confirm} />
          <p className="text-xs text-ink-muted">Changing your password signs you out on every other device.</p>
          <Button type="submit" loading={pending} icon={<KeyRound className="h-4 w-4" />}>Change password</Button>
        </form>
      </Card>

      <Card title="Biometric sign-in (passkeys)" description="Sign in with your device’s fingerprint, face recognition or screen lock. Your biometric data never leaves your device; we only store a public key.">
        {support === null && <p className="text-sm text-ink-muted">Checking this device…</p>}
        {support && !support.webauthn && <Alert tone="warning" title="Not available in this browser">This browser does not support passkeys. Use a recent version of Chrome, Safari, Edge or Firefox.</Alert>}
        {support?.webauthn && !support.platform && <Alert tone="info">This device has no built-in fingerprint or face sensor. You can still use a phone or security key when your browser offers it.</Alert>}
        {passkeys.data && passkeys.data.length > 0 && (
          <ul className="my-4 divide-y divide-line rounded-lg border border-line">
            {passkeys.data.map(key => (
              <li key={key.id} className="flex items-center gap-3 p-3">
                <Fingerprint className="h-5 w-5 shrink-0 text-ink-subtle" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{key.label}</p>
                  <p className="text-xs text-ink-muted">Added {date(key.createdAt)} · {key.lastUsedAt ? `last used ${relative(key.lastUsedAt)}` : 'not used yet'}</p>
                </div>
                <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label={`Remove ${key.label}`} onClick={() => setRemoveKey(key.id)} />
              </li>
            ))}
          </ul>
        )}
        {support?.webauthn && <div className="mt-4"><Button variant="secondary" icon={<Fingerprint className="h-4 w-4" />} onClick={addPasskey}>Add a passkey on this device</Button></div>}
      </Card>

      <Card title="Where you’re signed in" actions={sessions.data && sessions.data.length > 1 && (
        <Button size="sm" variant="secondary" onClick={async () => { await api('/api/auth/sessions/revoke-others', { method: 'POST' }); toast('Signed out of other devices.'); void sessions.reload(); }}>Sign out everywhere else</Button>
      )}>
        <ul className="divide-y divide-line">
          {sessions.data?.map(session => (
            <li key={session.id} className="flex items-start gap-3 py-3">
              <Laptop className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink" title={session.userAgent ?? ''}>{describeAgent(session.userAgent)} {session.current && <Badge tone="success">This device</Badge>}</p>
                <p className="text-xs text-ink-muted">Signed in {dateTime(session.createdAt)} with {session.authMethod === 'passkey' ? 'a passkey' : 'a password'} · active {relative(session.lastSeenAt)}</p>
              </div>
              {!session.current && (
                <Button size="sm" variant="ghost" onClick={async () => { await api(`/api/auth/sessions/${session.id}`, { method: 'DELETE' }); void sessions.reload(); }}>Sign out</Button>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog open={Boolean(removeKey)} onClose={() => setRemoveKey(null)} title="Remove this passkey?" tone="danger" confirmLabel="Remove"
        onConfirm={async () => { await api(`/api/auth/passkeys/${removeKey}`, { method: 'DELETE' }); setRemoveKey(null); toast('Passkey removed.'); void passkeys.reload(); }}
        message="You will no longer be able to sign in with it." />
    </div>
  );
}

function describeAgent(agent: string | null): string {
  if (!agent) return 'Unknown device';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Windows/.test(agent) ? 'Windows' : /Mac OS/.test(agent) ? 'macOS' : /Linux/.test(agent) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

function NotificationSection({ profile }: { profile: Profile }) {
  const { refreshProfile } = useAuth();
  const toast = useToast();
  const channels = useResource<{ inApp: boolean; email: boolean; sms: boolean }>('/api/notifications/channels');
  const [prefs, setPrefs] = useState(profile.notificationPrefs);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    try {
      await api('/api/auth/me', { method: 'PATCH', body: { notificationPrefs: prefs } });
      await refreshProfile();
      toast('Notification preferences saved.');
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not save.', 'error');
    } finally {
      setPending(false);
    }
  };
  return (
    <Card title="How we contact you" description="In-app notifications are always on for important updates such as decisions and offers.">
      <div className="space-y-4">
        <Checkbox label="In-app notifications" checked disabled onChange={() => undefined} />
        <Checkbox label="Email" checked={prefs.email} onChange={email => setPrefs({ ...prefs, email })}
          description={channels.data && !channels.data.email ? 'Email delivery is not set up on this server yet, so nothing will be sent by email for now.' : `Sent to ${profile.email}.`} />
        <Checkbox label="SMS" checked={prefs.sms} onChange={sms => setPrefs({ ...prefs, sms })}
          description={channels.data && !channels.data.sms ? 'SMS delivery is not set up on this server yet, so nothing will be sent by SMS for now.' : profile.phone ? `Sent to ${profile.phone}.` : 'Add a phone number in your profile.'} />
        <Button onClick={save} loading={pending}>Save preferences</Button>
      </div>
    </Card>
  );
}
