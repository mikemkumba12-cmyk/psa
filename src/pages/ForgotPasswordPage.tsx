import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Coins, ChevronLeft, Mail, AlertCircle, CheckCircle, Loader2, Eye, EyeOff, Shield } from 'lucide-react';
import { getSecurityQuestion, resetPassword, verifySecurityAnswer } from '../auth/authService';

type Step = 'email' | 'security' | 'reset' | 'done';

const SECURITY_QUESTIONS = [
  "What city were you born in?",
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What was the name of your primary school?",
  "What is your oldest sibling's middle name?",
];

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputBase = `w-full px-4 py-3 rounded-xl border text-sm transition-all outline-none
    bg-white dark:bg-white/5 text-gray-900 dark:text-white
    border-gray-200 dark:border-white/10
    focus:ring-2 focus:ring-orange-400/60 focus:border-orange-400
    placeholder:text-gray-400 dark:placeholder:text-white/30`;

  const handleEmailStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Please enter your email.'); return; }
    setError('');
    const q = await getSecurityQuestion(email.trim());
    if (!q) { setError('No account found with this email address.'); return; }
    setSecurityQuestion(q);
    setSecurityAnswer('');
    setResetToken('');
    setStep('security');
  };

  const handleSecurityStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityAnswer) { setError('Please answer the security question.'); return; }
    setError('');
    setLoading(true);
    const result = await verifySecurityAnswer(email.trim(), securityAnswer);
    setLoading(false);
    if (!result.success || !result.resetToken) {
      setError(result.error || 'Security verification failed.');
      return;
    }
    setResetToken(result.resetToken);
    setStep('reset');
  };

  const handleResetStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!resetToken) { setError('Security verification expired. Please answer the question again.'); setStep('security'); return; }
    setLoading(true);
    const result = await resetPassword(resetToken, newPassword);
    setLoading(false);
    if (result.success) {
      setStep('done');
    } else {
      setError(result.error || 'Reset failed.');
      setResetToken('');
      setStep('security');
    }
  };

  const pwStrength = (() => {
    const p = newPassword;
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
    <div className="min-h-screen flex flex-col bg-[#fcf8f2] dark:bg-[#121212] transition-colors duration-300">
      {/* Top bar */}
      <div className="flex items-center px-6 py-4 gap-3">
        <button onClick={() => navigate(-1)} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-300" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
            <Coins className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-black text-base text-orange-600 dark:text-orange-400">Pinnacle</span>
        </div>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">

          {/* Step: done */}
          {step === 'done' ? (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">Password reset!</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">You can now sign in with your new password.</p>
              </div>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98]"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-orange-100 dark:bg-orange-500/20 rounded-2xl mx-auto flex items-center justify-center mb-4">
                  <Shield className="w-7 h-7 text-orange-500" />
                </div>
                <h1 className="text-2xl font-black text-gray-900 dark:text-white">
                  {step === 'email' ? 'Find your account' : step === 'security' ? 'Security check' : 'New password'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {step === 'email' ? "Enter the email linked to your account" : step === 'security' ? "Answer your security question" : "Create a strong new password"}
                </p>
              </div>

              {/* Step progress */}
              <div className="flex items-center gap-2 mb-6">
                {(['email', 'security', 'reset'] as Step[]).map((s, i) => (
                  <React.Fragment key={s}>
                    <div className={`h-1.5 flex-1 rounded-full transition-all ${
                      s === step ? 'bg-orange-500' :
                      (['email', 'security', 'reset'] as Step[]).indexOf(s) < (['email', 'security', 'reset'] as Step[]).indexOf(step) ? 'bg-green-500' :
                      'bg-gray-200 dark:bg-white/10'
                    }`} />
                  </React.Fragment>
                ))}
              </div>

              <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-3xl p-7 shadow-xl shadow-black/5 dark:shadow-black/30 space-y-4">

                {error && (
                  <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3.5">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</p>
                  </div>
                )}

                {/* Email step */}
                {step === 'email' && (
                  <form onSubmit={handleEmailStep} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input type="email" className={inputBase + ' pl-10'} placeholder="you@example.com" value={email} onChange={e => { setEmail(e.target.value); setError(''); }} />
                      </div>
                    </div>
                    <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98]">
                      Continue
                    </button>
                  </form>
                )}

                {/* Security question step */}
                {step === 'security' && (
                  <form onSubmit={handleSecurityStep} className="space-y-4">
                    <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/20 rounded-xl p-4">
                      <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">Security Question</p>
                      <p className="text-sm text-orange-700 dark:text-orange-200 font-semibold">{securityQuestion}</p>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Your Answer</label>
                      <input type="text" className={inputBase} placeholder="Type your answer…" value={securityAnswer} onChange={e => { setSecurityAnswer(e.target.value); setError(''); }} />
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : 'Verify Answer'}
                    </button>
                  </form>
                )}

                {/* Reset password step */}
                {step === 'reset' && (
                  <form onSubmit={handleResetStep} className="space-y-4">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">New Password</label>
                      <div className="relative">
                        <input type={showPw ? 'text' : 'password'} className={inputBase + ' pr-11'} placeholder="Minimum 8 characters" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError(''); }} />
                        <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                          {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {newPassword && (
                        <div className="mt-2 space-y-1">
                          <div className="flex gap-1">
                            {[0,1,2,3].map(i => (
                              <div key={i} className={`flex-1 h-1 rounded-full transition-all ${i < pwStrength ? strengthColors[pwStrength - 1] : 'bg-gray-200 dark:bg-white/10'}`} />
                            ))}
                          </div>
                          <p className="text-[10px] font-bold text-gray-400">{strengthLabels[pwStrength - 1] || 'Too short'}</p>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Confirm Password</label>
                      <input type="password" className={inputBase + (confirmPassword && newPassword !== confirmPassword ? ' border-red-400 ring-1 ring-red-300' : '')} placeholder="Re-enter new password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setError(''); }} />
                      {confirmPassword && newPassword !== confirmPassword && <p className="text-[10px] text-red-500 mt-1 font-semibold">Passwords do not match</p>}
                    </div>
                    <button type="submit" disabled={loading} className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                      {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : 'Reset Password'}
                    </button>
                  </form>
                )}
              </div>

              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
                Remember it?{' '}
                <Link to="/login" className="font-bold text-orange-600 dark:text-orange-400 hover:underline">Sign in</Link>
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
