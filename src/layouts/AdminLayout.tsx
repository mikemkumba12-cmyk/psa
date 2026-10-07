import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users2, PieChart, Coins, LogOut,
  Sun, Moon, Menu, X, Brain, BarChart3, Building2, UserCheck, FileSpreadsheet,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const NAV_ITEMS = [
  { to: '/staff/overview', label: 'Assessment Queue', Icon: LayoutDashboard },
  { to: '/staff/payroll', label: 'Payroll Deductions', Icon: FileSpreadsheet },
  { to: '/staff/customers', label: 'Client Directory', Icon: Users2 },
  { to: '/staff/sme', label: 'SME Portfolio', Icon: Building2 },
  { to: '/staff/reports', label: 'Reports', Icon: PieChart },
  { to: '/staff/intelligence', label: 'Intelligence', Icon: Brain },
  { to: '/staff/analytics', label: 'Analytics', Icon: BarChart3 },
  { to: '/staff/team', label: 'Staff Team', Icon: UserCheck },
];

export default function AdminLayout() {
  const { session, logout, theme, toggleTheme } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/staff/login', { replace: true });
  };

  const role = session?.role || 'loan_officer';

  // Role-based navigation filtering (BLG-04)
  const allowedNavItems = NAV_ITEMS.filter(({ to }) => {
    if (role === 'admin') return true;
    if (role === 'executive') return ['/staff/overview', '/staff/reports', '/staff/intelligence', '/staff/analytics'].includes(to);
    if (role === 'manager') return ['/staff/overview', '/staff/payroll', '/staff/customers', '/staff/sme', '/staff/reports'].includes(to);
    if (role === 'loan_officer') return ['/staff/overview', '/staff/payroll', '/staff/customers', '/staff/sme'].includes(to);
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#0f0f0f] transition-colors duration-300 flex">

      {/* ── DESKTOP SIDEBAR (lg+) ─────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-100 dark:border-white/5 bg-white dark:bg-[#141414] sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
              <Coins className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-orange-600 dark:text-orange-400 block">Pinnacle</span>
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block -mt-0.5">Credit Operations</span>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {allowedNavItems.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                }`}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Staff footer */}
        <div className="px-4 py-4 border-t border-gray-100 dark:border-white/5 space-y-3">
          <div className="flex items-center gap-3 bg-gray-50 dark:bg-white/5 rounded-xl p-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-black text-sm">
              {session?.fullName?.charAt(0).toUpperCase() || 'S'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{session?.fullName || 'Staff'}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                {session?.staffTitle || (role === 'admin' ? 'System Admin' : role === 'executive' ? 'Executive Director' : role === 'manager' ? 'Operations Manager' : 'Loan Officer')} &bull; Lilongwe
              </p>
            </div>
          </div>
          <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── TABLET ICON SIDEBAR (md only) ─────────────────────── */}
      <aside className="hidden md:flex lg:hidden flex-col w-16 border-r border-gray-100 dark:border-white/5 bg-white dark:bg-[#141414] sticky top-0 h-screen items-center py-4 gap-2">
        <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow mb-3">
          <Coins className="text-white w-4 h-4" />
        </div>
        {allowedNavItems.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} title={label}
            className={({ isActive }) =>
              `w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
              }`}>
            <Icon className="w-5 h-5" />
          </NavLink>
        ))}
        <div className="flex-1" />
        <button onClick={toggleTheme} title="Toggle theme" className="w-10 h-10 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
          {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
        </button>
        <button onClick={handleLogout} title="Sign out" className="w-10 h-10 rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center">
          <LogOut className="w-4 h-4" />
        </button>
      </aside>

      {/* ── MOBILE DRAWER ─────────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-72 bg-white dark:bg-[#1a1a1a] h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center"><Coins className="text-white w-4 h-4" /></div>
                <span className="font-black text-orange-600 dark:text-orange-400">Pinnacle Staff</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="w-8 h-8 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-3 space-y-1">
              {allowedNavItems.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}>
                  <Icon className="w-4 h-4" />{label}
                </NavLink>
              ))}
            </nav>
            <div className="px-3 py-3 border-t border-gray-100 dark:border-white/5 space-y-2">
              <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5">
                {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
                {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
              </button>
              <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10">
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center">
            <Menu className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center"><Coins className="text-white w-3.5 h-3.5" /></div>
            <span className="font-black text-base text-orange-600 dark:text-orange-400">Pinnacle Staff</span>
          </div>
          <button onClick={toggleTheme} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          <Outlet />
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-t border-gray-100 dark:border-white/5 px-2 py-2 flex justify-around z-30">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 flex-1 py-1 ${isActive ? 'text-orange-500' : 'text-gray-400'}`}>
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-orange-100 dark:bg-orange-500/20' : ''}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] font-bold tracking-wide">{label.split(' ')[0]}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
