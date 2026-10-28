import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { SessionResponse, StoredDocument } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../ui/Button';
import { FormErrorSummary, FormGrid, MoneyInput, PasswordInput, Select, TextInput } from '../../ui/Form';
import { passwordProblems } from '../../../shared/passwordPolicy';
import { Alert } from '../../ui/Feedback';
import { DocumentUploader } from '../../features/documents/Documents';
import { AuthShell } from './AuthShell';

const STEPS = ['Your details', 'Work and income', 'Account security', 'Identity documents'];
const DISTRICTS = ['Lilongwe', 'Blantyre', 'Mzuzu', 'Zomba', 'Kasungu', 'Mangochi', 'Salima', 'Dedza', 'Karonga', 'Other'];

export function RegisterPage() {
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', nationalId: '', dateOfBirth: '', gender: '', district: '', address: '',
    segment: 'individual', employmentType: '', employerName: '', employeeNumber: '', monthlyIncome: '' as number | '',
    password: '', confirmPassword: '', securityQuestion: 'What was the name of your first school?', securityAnswer: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<Record<string, StoredDocument>>({});

  // Editing a field clears its error, so a corrected value is never shown next to a stale message.
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => {
      if (!current[key] && !(key === 'password' && current.confirmPassword)) return current;
      const next = { ...current };
      delete next[key];
      if (key === 'password') delete next.confirmPassword;
      return next;
    });
    setServerError(null);
  };

  const validateStep = (index: number): boolean => {
    const next: Record<string, string> = {};
    if (index === 0) {
      if (form.fullName.trim().length < 3) next.fullName = 'Enter your full name as on your ID.';
      if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.';
      if (form.phone.replace(/\D/g, '').length < 9) next.phone = 'Enter a valid phone number.';
      if (form.nationalId.trim().length < 5) next.nationalId = 'Enter your national ID number.';
    }
    if (index === 2) {
      // Same rules as the server (shared/passwordPolicy.ts), so a password accepted here is accepted there.
      const problems = passwordProblems(form.password, { email: form.email });
      if (problems.length) next.password = problems.join(' ');
      if (form.password !== form.confirmPassword) next.confirmPassword = 'The passwords do not match.';
      if (form.securityAnswer.trim().length < 2) next.securityAnswer = 'Enter an answer you will remember.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const next = () => { if (validateStep(step)) setStep(step + 1); };

  const createAccount = async () => {
    if (!validateStep(2)) return;
    setPending(true);
    setServerError(null);
    try {
      const session = await api<SessionResponse>('/api/auth/register', {
        body: {
          fullName: form.fullName, email: form.email, phone: form.phone, nationalId: form.nationalId,
          dateOfBirth: form.dateOfBirth || undefined, gender: form.gender || undefined, district: form.district || undefined,
          address: form.address || undefined, segment: form.segment, employmentType: form.employmentType || undefined,
          employerName: form.employerName || undefined, employeeNumber: form.employeeNumber || undefined,
          monthlyIncome: form.monthlyIncome === '' ? undefined : form.monthlyIncome,
          password: form.password, securityQuestion: form.securityQuestion, securityAnswer: form.securityAnswer,
        },
      });
      // The account exists now; documents upload with the new session and are linked to this customer record.
      startSession(session, false);
      setCustomerId(session.profile.customer!.id);
      setStep(3);
    } catch (caught) {
      const apiError = caught instanceof ApiError ? caught : new ApiError(0, 'Registration failed.');
      setServerError(apiError);
      // Show every reason the server gave for each field, not just the first.
      const fieldErrors: Record<string, string> = {};
      for (const detail of apiError.details) fieldErrors[detail.field] = fieldErrors[detail.field] ? `${fieldErrors[detail.field]} ${detail.message}` : detail.message;
      setErrors(fieldErrors);
      if (['fullName', 'email', 'phone', 'nationalId'].some(field => fieldErrors[field])) setStep(0);
      else if (['monthlyIncome', 'employmentType', 'employerName', 'employeeNumber'].some(field => fieldErrors[field])) setStep(1);
    } finally {
      setPending(false);
    }
  };

  const idDone = Boolean(uploaded.national_id_front && uploaded.national_id_back);

  return (
    <AuthShell wide title="Create your account" subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      footer={<>Already registered? <Link className="font-semibold text-brand-700 hover:underline" to="/login">Sign in</Link></>}>
      <ol className="mb-6 grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className={`h-1.5 rounded-full ${index <= step ? 'bg-brand-600' : 'bg-surface-muted'}`}>
            <span className="sr-only">{label}{index < step ? ' (done)' : index === step ? ' (current)' : ''}</span>
          </li>
        ))}
      </ol>

      {serverError && step < 3 && <div className="mb-4"><FormErrorSummary message={serverError.message} details={serverError.details} visibleFields={Object.keys(form)} /></div>}

      {step === 0 && (
        <FormGrid>
          <TextInput label="Full name" autoComplete="name" required value={form.fullName} onChange={set('fullName')} error={errors.fullName} fieldClassName="md:col-span-2" />
          <TextInput label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={errors.email} />
          <TextInput label="Phone number" type="tel" autoComplete="tel" required value={form.phone} onChange={set('phone')} error={errors.phone} placeholder="+265 …" />
          <TextInput label="National ID number" required value={form.nationalId} onChange={set('nationalId')} error={errors.nationalId} />
          <TextInput label="Date of birth" type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')} />
          <Select label="Gender" value={form.gender} onChange={set('gender')} placeholder="Prefer not to say" options={[{ value: 'Female', label: 'Female' }, { value: 'Male', label: 'Male' }]} />
          <Select label="District" value={form.district} onChange={set('district')} placeholder="Choose…" options={DISTRICTS.map(value => ({ value, label: value }))} />
          <TextInput label="Physical address" autoComplete="street-address" value={form.address} onChange={set('address')} fieldClassName="md:col-span-2" />
        </FormGrid>
      )}

      {step === 1 && (
        <FormGrid>
          <Select label="I am applying mainly as" value={form.segment} onChange={set('segment')} fieldClassName="md:col-span-2"
            options={[{ value: 'individual', label: 'An individual (e.g. salaried employee)' }, { value: 'sme', label: 'A business owner or representative' }]} />
          <Select label="Employment" value={form.employmentType} onChange={set('employmentType')} placeholder="Choose…"
            options={['Employed (public sector)', 'Employed (private sector)', 'Self-employed', 'Business owner', 'Other'].map(value => ({ value, label: value }))} />
          <TextInput label="Employer or business name" value={form.employerName} onChange={set('employerName')} />
          <TextInput label="Employee number" value={form.employeeNumber} onChange={set('employeeNumber')} hint="Needed for payroll loans." />
          <MoneyInput label="Monthly net income" value={form.monthlyIncome} onValueChange={value => setForm(current => ({ ...current, monthlyIncome: value }))} hint="After tax and deductions. You can update this later." />
        </FormGrid>
      )}

      {step === 2 && (
        <FormGrid>
          <PasswordInput label="Password" autoComplete="new-password" required value={form.password} onChange={set('password')} error={errors.password} rules={{ email: form.email }} />
          <PasswordInput label="Confirm password" autoComplete="new-password" required value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword}
            hint={form.confirmPassword ? (form.confirmPassword === form.password ? 'Passwords match.' : 'Passwords do not match yet.') : undefined} />
          <Select label="Security question" value={form.securityQuestion} onChange={set('securityQuestion')} fieldClassName="md:col-span-2"
            options={['What was the name of your first school?', 'What is your mother’s maiden name?', 'In which village were you born?', 'What was your first pet’s name?'].map(value => ({ value, label: value }))} />
          <TextInput label="Answer" required value={form.securityAnswer} onChange={set('securityAnswer')} error={errors.securityAnswer} hint="Used to reset your password. Not case-sensitive." fieldClassName="md:col-span-2" />
        </FormGrid>
      )}

      {step === 3 && customerId && (
        <div className="space-y-5">
          <Alert tone="success" title="Your account is ready">Upload both sides of your national ID so our team can verify you. Files are stored privately and only authorised staff can open them.</Alert>
          {(['national_id_front', 'national_id_back'] as const).map(code => (
            <div key={code} className="rounded-lg border border-line p-4">
              <p className="mb-3 text-sm font-semibold text-ink">{code === 'national_id_front' ? 'National ID — front' : 'National ID — back'}</p>
              {uploaded[code]
                ? <p className="flex items-center gap-2 text-sm text-success-700"><CheckCircle2 className="h-5 w-5" aria-hidden /> {uploaded[code].fileName} uploaded — awaiting review</p>
                : <DocumentUploader documentType={code} owner={{ customerId }} label="Choose photo or PDF" onUploaded={doc => setUploaded(current => ({ ...current, [code]: doc }))} />}
            </div>
          ))}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {!idDone && <Button variant="ghost" onClick={() => navigate('/client')}>I’ll do this later</Button>}
            <Button disabled={!idDone} onClick={() => navigate('/client')}>Go to my dashboard</Button>
          </div>
        </div>
      )}

      {step < 3 && (
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" disabled={step === 0 || pending} onClick={() => setStep(step - 1)}>Back</Button>
          {step < 2
            ? <Button onClick={next}>Continue</Button>
            : <Button onClick={createAccount} loading={pending}>Create account</Button>}
        </div>
      )}
    </AuthShell>
  );
}
