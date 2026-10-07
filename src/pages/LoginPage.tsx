import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, EyeOff, Coins, AlertCircle, Loader2, Sun, Moon, CheckCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, theme, toggleTheme } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  useEffect(() => {
    if (searchParams.get('registered') === '1') {
      setRegistrationSuccess(true);
      // Clean up the URL parameter without triggering a re-render loop
      setSearchParams({}, { replace: true });
      // Auto-dismiss after 8 seconds
      const timer = setTimeout(() => setRegistrationSuccess(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields.'); return; }
    setLoading(true);
    setError('');
    const result = await login(email.trim(), password, remember);
    setLoading(false);
    if (result.success && result.session) {
      navigate(result.session.role !== 'customer' ? '/staff' : '/client', { replace: true });
    } else {
      setError(result.error || 'Login failed.');
    }
  };

  const inputBase = `w-full px-4 py-3 rounded-xl border text-sm transition-all outline-none
    bg-white dark:bg-white/5 text-gray-900 dark:text-white
    border-gray-200 dark:border-white/10
    focus:ring-2 focus:ring-orange-400/60 focus:border-orange-400
    placeholder:text-gray-400 dark:placeholder:text-white/30`;

  return (
    <div className="min-h-screen flex flex-col bg-[#fcf8f2] dark:bg-[#121212] transition-colors duration-300">

      {/* Top bar */}
      <div className="flex justify-between items-center px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center shadow">
            <Coins className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-lg text-orange-600 dark:text-orange-400 tracking-tight">Pinnacle</span>
        </div>
        <button onClick={toggleTheme} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-white/10 transition-colors" aria-label="Toggle theme">
          {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
        </button>
      </div>

      {/* Main card */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">

          {/* Hero text */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-orange-500/30 mb-5">
              <Coins className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-black text-gray-900 dark:text-white">Welcome back</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Sign in to your Pinnacle account</p>
          </div>

          {/* Form card */}
          <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-3xl p-7 shadow-xl shadow-black/5 dark:shadow-black/30">
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Success banner (from registration) */}
              {registrationSuccess && (
                <div className="flex items-center gap-3 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-xl p-3.5">
                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-green-700 dark:text-green-300">
                    Account created successfully! Sign in with your credentials.
                  </p>
                </div>
              )}

              {/* Error banner */}
              {error && (
                <div className="flex items-center gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl p-3.5">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs font-semibold text-red-700 dark:text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className={inputBase}
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    className={inputBase + ' pr-11'}
                    placeholder="Enter your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember me + Forgot / Activation */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={e => setRemember(e.target.checked)}
                    className="w-4 h-4 rounded accent-orange-500"
                  />
                  <span className="font-semibold text-gray-600 dark:text-gray-300">Remember me</span>
                </label>
                <div className="flex items-center gap-3">
                  <Link to="/activate" className="font-bold text-orange-600 dark:text-orange-400 hover:underline">
                    Activate Account
                  </Link>
                  <span className="text-gray-300 dark:text-gray-600">&bull;</span>
                  <Link to="/forgot-password" className="font-bold text-gray-500 hover:underline">
                    Forgot?
                  </Link>
                </div>
              </div>

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-sm rounded-xl shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing in…</> : 'Sign In'}
              </button>
            </form>
          </div>

          {/* Register link */}
          <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="font-bold text-orange-600 dark:text-orange-400 hover:underline">
              Create one free
            </Link>
          </p>

          {/* Staff hint */}
          <div className="mt-6 bg-white dark:bg-white/[0.04] border border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-4 text-center">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-700 dark:text-gray-300">Pinnacle Staff?</span>{' '}
              Use your staff credentials or visit{' '}
              <Link to="/staff/login" className="text-orange-600 dark:text-orange-400 font-bold hover:underline">/staff</Link>
            </p>
          </div>

          <p className="text-center text-[10px] text-gray-400 dark:text-gray-600 mt-6 font-semibold uppercase tracking-wider">
            Pinnacle Microfinance Institution · Malawi
          </p>
        </div>
      </main>
    </div>
  );
}

