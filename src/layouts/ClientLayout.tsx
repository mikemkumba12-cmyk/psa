import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home, FileText, Briefcase, MessageSquare, User,
  Calculator, Coins, LogOut, Sun, Moon, Menu, X, Bell, Brain,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useClientData } from '../context/ClientContext';
import { alertsStore } from '../lib/store';
import AIAssessmentModal from '../components/AIAssessmentModal';

const NAV_ITEMS = [
  { to: '/client/home', label: 'Home', Icon: Home },
  { to: '/client/loans', label: 'Loans', Icon: FileText },
  { to: '/client/business', label: 'Business', Icon: Briefcase },
  { to: '/client/advisor', label: 'AI Advisor', Icon: Brain },
  { to: '/client/messages', label: 'Inbox', Icon: MessageSquare },
  { to: '/client/profile', label: 'Profile', Icon: User },
];

export default function ClientLayout() {
  const { session, logout, theme, toggleTheme } = useAuth();
  const { latestAssessmentModal, closeAssessmentModal } = useClientData();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    setUnreadAlerts(alertsStore.getAll().filter(a => a.type === 'critical' || a.type === 'approval').length);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#fcf8f2] dark:bg-[#121212] transition-colors duration-300 flex">

      {/* ── DESKTOP SIDEBAR (lg+) ─────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-64 border-r border-gray-100 dark:border-white/5 bg-white dark:bg-white/[0.02] sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-gray-100 dark:border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-md shadow-orange-500/30">
            <Coins className="text-white w-5 h-5" />
          </div>
          <div>
            <span className="font-black text-base tracking-tight text-orange-600 dark:text-orange-400 block">Pinnacle</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block -mt-0.5">Smart Advisor</span>
          </div>
        </div>

        {/* User card */}
        <div className="px-4 py-4 border-b border-gray-100 dark:border-white/5">
          <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl p-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-black text-sm">
              {session?.fullName?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{session?.fullName || 'Client'}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{session?.customerType || 'Individual'} Account</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
                }`
              }>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
          <NavLink to="/client/calculator"
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'
              }`}>
            <Calculator className="w-4 h-4" />
            Loan Calculator
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-3 py-4 border-t border-gray-100 dark:border-white/5 space-y-2">
          <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </aside>

      {/* ── TABLET ICON SIDEBAR (md only) ─────────────────────────── */}
      <aside className="hidden md:flex lg:hidden flex-col w-16 border-r border-gray-100 dark:border-white/5 bg-white dark:bg-white/[0.02] sticky top-0 h-screen items-center py-4 gap-2">
        <div className="w-9 h-9 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow mb-3">
          <Coins className="text-white w-4 h-4" />
        </div>
        {NAV_ITEMS.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} title={label}
            className={({ isActive }) =>
              `w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'
              }`}>
            <Icon className="w-5 h-5" />
          </NavLink>
        ))}
        <div className="flex-1" />
        <button onClick={toggleTheme} title="Toggle theme" className="w-10 h-10 rounded-xl text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center transition-colors">
          {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4" />}
        </button>
        <button onClick={handleLogout} title="Sign out" className="w-10 h-10 rounded-xl text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center justify-center transition-colors">
          <LogOut className="w-4 h-4" />
        </button>
      </aside>

      {/* ── MOBILE DRAWER OVERLAY ─────────────────────────────────── */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-72 bg-white dark:bg-[#1a1a1a] h-full flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-orange-500 rounded-xl flex items-center justify-center">
                  <Coins className="text-white w-4 h-4" />
                </div>
                <span className="font-black text-orange-600 dark:text-orange-400">Pinnacle</span>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 flex items-center justify-center">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="px-4 py-4 border-b border-gray-100 dark:border-white/5">
              <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-500/10 rounded-xl p-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-black text-sm">
                  {session?.fullName?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{session?.fullName}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 capitalize">{session?.customerType} Account</p>
                </div>
              </div>
            </div>
            <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map(({ to, label, Icon }) => (
                <NavLink key={to} to={to} onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      isActive ? 'bg-orange-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}>
                  <Icon className="w-4 h-4" />{label}
                </NavLink>
              ))}
            </nav>
            <div className="px-3 py-3 border-t border-gray-100 dark:border-white/5 space-y-2">
              <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5">
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

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md border-b border-gray-100 dark:border-white/5 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setDrawerOpen(true)} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center">
            <Menu className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <Coins className="text-white w-3.5 h-3.5" />
            </div>
            <span className="font-black text-base text-orange-600 dark:text-orange-400">Pinnacle</span>
          </div>
          <button onClick={toggleTheme} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center">
            {theme === 'dark' ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-gray-500" />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-6 overflow-y-auto">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-[#1a1a1a]/95 backdrop-blur-md border-t border-gray-100 dark:border-white/5 px-2 py-2 flex justify-between items-center z-30 shadow-lg">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 flex-1 py-1 transition-all relative ${
                  isActive ? 'text-orange-500' : 'text-gray-400'
                }`}>
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-orange-100 dark:bg-orange-500/20' : ''}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[9px] font-bold tracking-wider">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      {/* AI Assessment Verdict Modal */}
      {latestAssessmentModal && (
        <AIAssessmentModal
          data={latestAssessmentModal}
          onClose={closeAssessmentModal}
        />
      )}
    </div>
  );
}
