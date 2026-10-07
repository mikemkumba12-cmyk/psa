import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, ArrowRight, CheckCircle, AlertCircle, Loader2, KeyRound } from 'lucide-react';
import { customersStore } from '../lib/store';
import { register } from '../auth/authService';

export default function CustomerActivationPage() {
  const navigate = useNavigate();

  const [nationalId, setNationalId] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');

  const [step, setStep] = useState<'verify' | 'otp' | 'password' | 'success'>('verify');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matchedCustomer, setMatchedCustomer] = useState<any>(null);

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nationalId.trim() || !employeeNumber.trim() || !phone.trim()) {
      setError('Please provide National ID, Employee Number, and Registered Phone Number.');
      return;
    }

    setLoading(true);
    setError('');

    setTimeout(() => {
      const customers = customersStore.getAll();
      const match = customers.find(c =>
        (c as any).nationalId?.toLowerCase() === nationalId.toLowerCase().trim() ||
        (c.employeeNumber?.toLowerCase() === employeeNumber.toLowerCase().trim() && c.phone === phone.trim())
      );

      setLoading(false);

      if (!match) {
        setError('No matching imported customer record found. Please verify your details with your PINACO loan officer.');
        return;
      }

      setMatchedCustomer(match);
      setStep('otp');
    }, 800);
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp !== '123456' && otp.length !== 6) {
      setError('Invalid OTP code. For demo purposes, enter 123456.');
      return;
    }
    setError('');
    setStep('password');
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userEmail = matchedCustomer.email || `${matchedCustomer.employeeNumber || 'emp'}@pinaco-customer.mw`;
      // Register account or activate existing user
      const regRes = await register({
        fullName: matchedCustomer.name,
        email: userEmail,
        phone: matchedCustomer.phone || phone,
        address: matchedCustomer.location || 'Malawi',
        nationalId: matchedCustomer.nationalId || nationalId,
        dob: '1990-01-01',
        gender: 'Male',
        employmentType: 'Employed',
        employer: matchedCustomer.sector || 'PINACO Employer',
        monthlyIncome: '500000',
        customerType: 'individual',
        password,
        securityQuestion: 'What is your employee ID?',
        securityAnswer: employeeNumber,
      });

      if (!regRes.success) {
        setLoading(false);
        setError(regRes.error || 'Activation failed.');
        return;
      }

      // Mark customer record as activated and link userId
      customersStore.update(matchedCustomer.id, {
        isActivated: true,
        status: 'Active / Low Risk',
        userId: userEmail,
      });

      setLoading(false);
      setStep('success');
    } catch (err: any) {
      setLoading(false);
      setError(err?.message || 'Activation failed.');
    }
  };

  const inputClass = `w-full px-4 py-3 rounded-xl border text-sm transition-all outline-none bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-orange-400 focus:border-orange-400 text-gray-900 dark:text-white`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fcf8f2] dark:bg-[#121212] p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#1a1a1a] border border-outline-variant rounded-3xl p-8 shadow-xl space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-orange-100 dark:bg-orange-950/30 rounded-2xl flex items-center justify-center mx-auto text-orange-600">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-on-surface">PINACO Account Activation</h1>
          <p className="text-xs text-secondary">Self-activate your digital lending portal account if you are an existing PINACO client.</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-700 dark:text-red-300 p-3.5 rounded-xl text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Verify factors */}
        {step === 'verify' && (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">National ID</label>
              <input type="text" placeholder="e.g. 12345678" value={nationalId} onChange={e => setNationalId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Employee Number</label>
              <input type="text" placeholder="e.g. EMP-001" value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Registered Phone Number</label>
              <input type="tel" placeholder="+265 888 ..." value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Verify Eligibility
            </button>
          </form>
        )}

        {/* Step 2: OTP Factor */}
        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 p-3 rounded-xl text-xs text-orange-800 dark:text-orange-300 font-semibold">
              Verification SMS sent to <strong>{phone}</strong>. Enter the 6-digit code below (Demo OTP: <strong>123456</strong>).
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">6-Digit Verification Code</label>
              <input type="text" maxLength={6} placeholder="123456" value={otp} onChange={e => setOtp(e.target.value)} className={inputClass + ' text-center font-mono text-lg tracking-widest'} />
            </div>
            <button type="submit" className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl transition-colors">
              Confirm OTP
            </button>
          </form>
        )}

        {/* Step 3: Password creation */}
        {step === 'password' && (
          <form onSubmit={handleCreatePassword} className="space-y-4">
            <p className="text-xs text-secondary">Welcome, <strong>{matchedCustomer?.name}</strong>! Create a password to complete self-activation.</p>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Create Password</label>
              <input type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-xs font-bold text-secondary uppercase mb-1">Confirm Password</label>
              <input type="password" placeholder="Re-enter password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />} Activate Account
            </button>
          </form>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="text-center space-y-4">
            <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
            <h2 className="text-lg font-bold text-on-surface">Account Activated!</h2>
            <p className="text-xs text-secondary">You can now sign in to view your existing loans, repayments, and apply for top-ups online.</p>
            <button onClick={() => navigate('/login?registered=1')} className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm rounded-xl transition-colors">
              Go to Login
            </button>
          </div>
        )}

        <div className="text-center border-t border-outline-variant pt-4">
          <Link to="/login" className="text-xs font-bold text-secondary hover:underline">
            Already activated? Back to Login
          </Link>
        </div>

      </div>
    </div>
  );
}
