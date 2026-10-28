import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { SessionResponse } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Feedback';
import { FormErrorSummary, FormGrid, PasswordInput, Select, TextInput } from '../../ui/Form';
import { AuthShell } from './AuthShell';

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [stage, setStage] = useState<'email' | 'answer' | 'reset' | 'done'>('email');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const run = async (work: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try { await work(); } catch (caught) { setError(caught instanceof ApiError ? caught : new ApiError(0, 'Something went wrong.')); } finally { setPending(false); }
  };

  return (
    <AuthShell title="Reset your password" subtitle="Answer your security question to choose a new password." footer={<Link className="font-semibold text-brand-700 hover:underline" to="/login">Back to sign in</Link>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        {stage === 'email' && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => {
            const result = await api<{ securityQuestion: string }>('/api/auth/forgot-password/question', { body: { email } });
            setQuestion(result.securityQuestion);
            setStage('answer');
          }); }}>
            <TextInput label="Email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
            <Button type="submit" block loading={pending} disabled={!email}>Continue</Button>
          </form>
        )}
        {stage === 'answer' && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); void run(async () => {
            const result = await api<{ resetToken: string }>('/api/auth/forgot-password/verify', { body: { email, answer } });
            setToken(result.resetToken);
            setStage('reset');
          }); }}>
            <TextInput label={question} required value={answer} onChange={event => setAnswer(event.target.value)} />
            <Button type="submit" block loading={pending} disabled={!answer}>Verify</Button>
          </form>
        )}
        {stage === 'reset' && (
          <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (password !== confirm) { setError(new ApiError(0, 'The passwords do not match.')); return; } void run(async () => {
            await api('/api/auth/forgot-password/reset', { body: { resetToken: token, newPassword: password } });
            setStage('done');
          }); }}>
            <PasswordInput label="New password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} rules={{ email }} />
            <PasswordInput label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={event => setConfirm(event.target.value)} />
            <Button type="submit" block loading={pending}>Set new password</Button>
          </form>
        )}
        {stage === 'done' && (
          <>
            <Alert tone="success" title="Password changed">You have been signed out on all devices. Sign in with your new password.</Alert>
            <Button block onClick={() => navigate('/login')}>Sign in</Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

/** For existing clients added by staff who do not yet have a portal login. */
export function ActivatePage() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ nationalId: '', employeeNumber: '', phone: '', email: '', password: '', confirm: '', securityQuestion: 'What was the name of your first school?', securityAnswer: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(current => ({ ...current, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form.password !== form.confirm) { setError(new ApiError(0, 'The passwords do not match.')); return; }
    setPending(true);
    setError(null);
    try {
      const session = await api<SessionResponse>('/api/auth/activate', { body: { ...form, confirm: undefined } });
      startSession(session);
      navigate('/client', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Activation failed.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <AuthShell wide title="Activate your account" subtitle="For existing Pinnacle clients. Enter the details we hold for you." footer={<Link className="font-semibold text-brand-700 hover:underline" to="/login">Back to sign in</Link>}>
      <form onSubmit={submit} className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="National ID number" required value={form.nationalId} onChange={set('nationalId')} />
          <TextInput label="Employee number" required value={form.employeeNumber} onChange={set('employeeNumber')} />
          <TextInput label="Phone number on file" type="tel" required value={form.phone} onChange={set('phone')} />
          <TextInput label="Email for signing in" type="email" autoComplete="email" required value={form.email} onChange={set('email')} />
          <PasswordInput label="Password" autoComplete="new-password" required value={form.password} onChange={set('password')} rules={{ email: form.email }} />
          <PasswordInput label="Confirm password" autoComplete="new-password" required value={form.confirm} onChange={set('confirm')} />
          <Select label="Security question" value={form.securityQuestion} onChange={set('securityQuestion')}
            options={['What was the name of your first school?', 'What is your mother’s maiden name?', 'In which village were you born?'].map(value => ({ value, label: value }))} />
          <TextInput label="Answer" required value={form.securityAnswer} onChange={set('securityAnswer')} />
        </FormGrid>
        <Button type="submit" block size="lg" loading={pending}>Activate account</Button>
      </form>
    </AuthShell>
  );
}
