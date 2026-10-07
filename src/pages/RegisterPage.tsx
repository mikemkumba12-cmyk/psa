import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  User, Briefcase, Shield, ChevronRight, ChevronLeft, CheckCircle,
  Upload, Eye, EyeOff, Phone, Mail, MapPin, CreditCard, Building2,
  Coins, Loader2, AlertCircle, Lock
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const STEPS = [
  { id: 1, label: 'Personal', icon: User },
  { id: 2, label: 'Employment', icon: Briefcase },
  { id: 3, label: 'Security', icon: Shield },
];

const SECURITY_QUESTIONS = [
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What was the name of your primary school?",
  "What is your oldest sibling's middle name?",
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [idFrontUploaded, setIdFrontUploaded] = useState(false);
  const [idFrontFileName, setIdFrontFileName] = useState('');
  const [idBackUploaded, setIdBackUploaded] = useState(false);
  const [idBackFileName, setIdBackFileName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    customerType: 'individual' as 'individual' | 'sme',
    fullName: '', nationalId: '', dob: '', gender: '',
    phone: '', email: '', address: '',
    employmentType: '', employer: '', monthlyIncome: '',
    password: '', confirmPassword: '',
    securityQuestion: SECURITY_QUESTIONS[0],
    securityAnswer: '',
  });

  const update = (field: string, value: string) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const inputBase = `w-full bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10
    rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white
    placeholder:text-gray-400 dark:placeholder:text-white/30
    focus:outline-none focus:ring-2 focus:ring-orange-400/60 focus:border-orange-400 transition-all`;

  const labelBase = 'block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5';

  const canProceed = () => {
    if (step === 1) return Boolean(form.fullName && form.phone && form.email && form.nationalId && idFrontUploaded && idBackUploaded);
    if (step === 2) return Boolean(form.employmentType && form.monthlyIncome);
    if (step === 3) return Boolean(form.password.length >= 8 && form.password === form.confirmPassword && form.securityAnswer && agreed);
    return false;
  };

  const handleFrontFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setIdFrontUploaded(true); setIdFrontFileName(file.name); }
  };

  const handleBackFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setIdBackUploaded(true); setIdBackFileName(file.name); }
  };

  const handleSubmit = async () => {
    if (!canProceed()) return;
    setLoading(true);
    setError('');
    const result = await register({
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      nationalId: form.nationalId,
      dob: form.dob,
      gender: form.gender,
      employmentType: form.employmentType,
      employer: form.employer,
      monthlyIncome: form.monthlyIncome,
      customerType: form.customerType,
      password: form.password,
      securityQuestion: form.securityQuestion,
      securityAnswer: form.securityAnswer,
    });
    setLoading(false);
    if (result.success) {
      navigate('/login?registered=1', { replace: true });
    } else {
      setError(result.error || 'Registration failed.');
    }
  };

  const pwStrength = (() => {
    const p = form.password;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();

  const strengthColors = ['bg-red-400', 'bg-yellow-400', 'bg-blue-400', 'bg-green-500'];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

  return (
    <div className="min-h-screen bg-[#fcf8f2] dark:bg-[#121212] transition-colors duration-300">
      {/* Top bar */}
      <div className="sticky top-0 z-20 bg-[#fcf8f2]/95 dark:bg-[#121212]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5 flex items-center px-4 py-3 gap-3">
        <button onClick={() => step > 1 ? setStep(step - 1) : navigate('/login')} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
            <Coins className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-black text-base text-orange-600 dark:text-orange-400">Pinnacle</span>
        </div>
        <div className="ml-auto text-xs font-bold text-gray-400">Step {step} of 3</div>
      </div>

      <main className="max-w-lg mx-auto px-4 py-6 pb-10 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Create Account</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Join Pinnacle MFI — secure, fast, and free</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = s.id === step;
            const isDone = s.id < step;
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                    isDone ? 'bg-green-500 text-white' :
                    isActive ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30' :
                    'bg-gray-100 dark:bg-white/10 text-gray-400'
                  }`}>
                    {isDone ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-4 rounded-full transition-all ${s.id < step ? 'bg-green-400' : 'bg-gray-200 dark:bg-white/10'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3.5">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* ── STEP 1: Personal Info ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Personal Information</h2>

              <div>
                <label className={labelBase}>Account Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['individual', 'sme'] as const).map(type => (
                    <button key={type} type="button" onClick={() => update('customerType', type)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                        form.customerType === type
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                          : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-orange-300'
                      }`}>
                      {type === 'individual' ? '👤 Individual' : '🏢 SME / Business'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelBase}>Full Legal Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={inputBase + ' pl-10'} placeholder="e.g. John Banda" value={form.fullName} onChange={e => update('fullName', e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelBase}>Date of Birth</label>
                  <input type="date" className={inputBase} value={form.dob} onChange={e => update('dob', e.target.value)} />
                </div>
                <div>
                  <label className={labelBase}>Gender</label>
                  <select className={inputBase} value={form.gender} onChange={e => update('gender', e.target.value)}>
                    <option value="">Select</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className={labelBase}>Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={inputBase + ' pl-10'} placeholder="+265 9XX XXX XXX" value={form.phone} onChange={e => update('phone', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelBase}>Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={inputBase + ' pl-10'} type="email" placeholder="you@example.com" value={form.email} onChange={e => update('email', e.target.value)} />
                </div>
              </div>

              <div>
                <label className={labelBase}>Physical Address</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={inputBase + ' pl-10'} placeholder="e.g. Area 14, Lilongwe" value={form.address} onChange={e => update('address', e.target.value)} />
                </div>
              </div>
            </div>

            {/* National ID */}
            <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">National ID Verification</h2>
              <div>
                <label className={labelBase}>National ID Number</label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input className={inputBase + ' pl-10'} placeholder="e.g. 1234-56-7890123-4" value={form.nationalId} onChange={e => update('nationalId', e.target.value)} />
                </div>
              </div>
              <div className="space-y-3">
                <label className={labelBase}>Upload National ID (Both Front & Back Required)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Front Side Upload */}
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 mb-1">1. FRONT SIDE</span>
                    {idFrontUploaded ? (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-3">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-[11px] font-bold text-green-800 dark:text-green-300 truncate">{idFrontFileName}</p>
                          <p className="text-[9px] text-green-600 dark:text-green-400">Front uploaded</p>
                        </div>
                      </div>
                    ) : (
                      <label className="w-full border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col items-center gap-1.5 hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-500/5 transition-all cursor-pointer">
                        <Upload className="w-4 h-4 text-orange-500" />
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Upload Front Side</p>
                        <p className="text-[9px] text-gray-400">Image or PDF</p>
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFrontFileChange} />
                      </label>
                    )}
                  </div>

                  {/* Back Side Upload */}
                  <div>
                    <span className="block text-[10px] font-bold text-gray-400 mb-1">2. BACK SIDE</span>
                    {idBackUploaded ? (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-3">
                        <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                        <div className="truncate">
                          <p className="text-[11px] font-bold text-green-800 dark:text-green-300 truncate">{idBackFileName}</p>
                          <p className="text-[9px] text-green-600 dark:text-green-400">Back uploaded</p>
                        </div>
                      </div>
                    ) : (
                      <label className="w-full border-2 border-dashed border-gray-200 dark:border-white/10 rounded-xl p-4 flex flex-col items-center gap-1.5 hover:border-orange-300 dark:hover:border-orange-500/50 hover:bg-orange-50/50 dark:hover:bg-orange-500/5 transition-all cursor-pointer">
                        <Upload className="w-4 h-4 text-orange-500" />
                        <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">Upload Back Side</p>
                        <p className="text-[9px] text-gray-400">Image or PDF</p>
                        <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleBackFileChange} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Employment ── */}
        {step === 2 && (
          <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Employment / Business Details</h2>

            <div>
              <label className={labelBase}>Employment Type</label>
              <div className="grid grid-cols-2 gap-2">
                {['Employed', 'Self-Employed', 'Business Owner', 'Informal Trader'].map(type => (
                  <button key={type} type="button" onClick={() => update('employmentType', type)}
                    className={`py-2.5 px-3 rounded-xl text-[11px] font-bold border transition-all text-left ${
                      form.employmentType === type
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20'
                        : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:border-orange-300'
                    }`}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelBase}>Employer / Business Name</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input className={inputBase + ' pl-10'} placeholder="Company or business name" value={form.employer} onChange={e => update('employer', e.target.value)} />
              </div>
            </div>

            <div>
              <label className={labelBase}>Monthly Income (MWK)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-orange-500">K</span>
                <input className={inputBase + ' pl-8'} type="number" placeholder="e.g. 350,000" value={form.monthlyIncome} onChange={e => update('monthlyIncome', e.target.value)} />
              </div>
            </div>

            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3">
              <p className="text-[11px] text-blue-800 dark:text-blue-300 leading-relaxed">
                💡 <strong>Tip:</strong> Your income determines borrowing eligibility. Higher documented income may qualify you for loans up to <strong>MWK 10,000,000</strong>.
              </p>
            </div>
          </div>
        )}

        {/* ── STEP 3: Security & Consent ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Account Security</h2>

              <div>
                <label className={labelBase}>Create Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} className={inputBase + ' pr-11'} placeholder="Minimum 8 characters" value={form.password} onChange={e => update('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[0,1,2,3].map(i => (
                        <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i < pwStrength ? strengthColors[pwStrength - 1] : 'bg-gray-200 dark:bg-white/10'}`} />
                      ))}
                    </div>
                    {pwStrength > 0 && <p className="text-[10px] font-bold text-gray-400">{strengthLabels[pwStrength - 1]}</p>}
                  </div>
                )}
              </div>

              <div>
                <label className={labelBase}>Confirm Password</label>
                <input type="password" className={inputBase + (form.confirmPassword && form.password !== form.confirmPassword ? ' border-red-400 ring-1 ring-red-300' : '')} placeholder="Re-enter password" value={form.confirmPassword} onChange={e => update('confirmPassword', e.target.value)} />
                {form.confirmPassword && form.password !== form.confirmPassword && (
                  <p className="text-[10px] text-red-500 mt-1 font-semibold">Passwords do not match</p>
                )}
              </div>
            </div>

            {/* Security Question */}
            <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-bold text-gray-900 dark:text-white">Account Recovery</h2>
              </div>
              <div>
                <label className={labelBase}>Security Question</label>
                <select className={inputBase} value={form.securityQuestion} onChange={e => update('securityQuestion', e.target.value)}>
                  {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                </select>
              </div>
              <div>
                <label className={labelBase}>Your Answer</label>
                <input className={inputBase} placeholder="Type your answer…" value={form.securityAnswer} onChange={e => update('securityAnswer', e.target.value)} />
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">Keep this secret — used for password recovery</p>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-5 space-y-3">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white">Notification Preferences</h2>
              {['SMS Alerts', 'Email Notifications', 'In-App Push Alerts'].map(pref => (
                <label key={pref} className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{pref}</span>
                  <div className="w-11 h-6 bg-orange-500 rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow" />
                  </div>
                </label>
              ))}
            </div>

            {/* Terms */}
            <label className="flex items-start gap-3 bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-4 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} className="mt-0.5 w-4 h-4 rounded accent-orange-500" />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                I agree to Pinnacle MFI's <span className="text-orange-600 dark:text-orange-400 font-semibold underline cursor-pointer">Terms & Conditions</span> and <span className="text-orange-600 dark:text-orange-400 font-semibold underline cursor-pointer">Privacy Policy</span>. I consent to the collection and processing of my data in compliance with the Malawi Data Protection Act.
              </p>
            </label>
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {step > 1 && (
            <button type="button" onClick={() => setStep(step - 1)} className="flex-1 py-3.5 rounded-2xl border border-gray-200 dark:border-white/10 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          )}
          {step < 3 ? (
            <button type="button" onClick={() => canProceed() && setStep(step + 1)}
              className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canProceed()
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 active:scale-[0.98]'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
              }`}>
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={!canProceed() || loading}
              className={`flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                canProceed() && !loading
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 active:scale-[0.98]'
                  : 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'
              }`}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</> : <><CheckCircle className="w-4 h-4" /> Create Account</>}
            </button>
          )}
        </div>

        <p className="text-center text-xs text-gray-500 dark:text-gray-400 pb-4">
          Already have an account?{' '}
          <Link to="/login" className="font-bold text-orange-600 dark:text-orange-400 hover:underline">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
