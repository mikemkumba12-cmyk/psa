import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';

// Pages
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import MarketingPage from './components/MarketingPage';

import CustomerActivationPage from './pages/CustomerActivationPage';

import PayrollPage from './components/PayrollPage';

// Layouts
import ClientLayout from './layouts/ClientLayout';
import AdminLayout from './layouts/AdminLayout';

// Client views
import ClientHome from './components/ClientHome';
import ClientLoans from './components/ClientLoans';
import ClientBusiness from './components/ClientBusiness';
import ClientMessages from './components/ClientMessages';
import ClientProfile from './components/ClientProfile';
import ClientLoanCalculator from './components/ClientLoanCalculator';
import DocumentUpload from './components/DocumentUpload';
import NotificationSettings from './components/NotificationSettings';
import ContactPinnacle from './components/ContactPinnacle';
import ClientAIAdvisor from './components/ClientAIAdvisor';

// Admin views
import AdminOverview from './components/AdminOverview';
import AdminCustomers from './components/AdminCustomers';
import AdminReports from './components/AdminReports';
import AdminReview from './components/AdminReview';
import AdminIntelligence from './components/AdminIntelligence';
import AdminAnalytics from './components/AdminAnalytics';
import AdminSMEPortfolio from './components/AdminSMEPortfolio';
import AdminStaffManagement from './components/AdminStaffManagement';

// Providers
import { ClientDataProvider, useClientData } from './context/ClientContext';
import { AdminDataProvider, useAdminData } from './context/AdminContext';

// ── Protected route guards ────────────────────────────────────────────────────
function RequireAuth({ role, children }: { role?: 'client' | 'staff'; children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcf8f2] dark:bg-[#121212]">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!session) {
    const loginPath = role === 'staff' ? '/staff/login' : '/login';
    return <Navigate to={loginPath} state={{ from: location }} replace />;
  }

  const isCustomer = session.role === 'customer';
  const isStaff = ['loan_officer', 'manager', 'executive', 'admin'].includes(session.role);

  if (role === 'client' && !isCustomer) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role === 'staff' && !isStaff) {
    return <Navigate to="/staff/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

// ── Staff login page (same component, different path hint) ─────────────────
function StaffLoginPage() {
  return <LoginPage />;
}

// ── Client portal with state management ──────────────────────────────────────
function ClientPortal() {
  const { logout } = useAuth();
  const {
    applications,
    repayments,
    chats,
    alerts,
    toast,
    triggerToast,
    handlePayInstallment,
    handleSubmitApplication,
    handleClearUnread,
  } = useClientData();
  const navigate = useNavigate();

  return (
    <>
      {toast && (
        <div className="fixed top-6 right-6 z-[100] animate-in fade-in slide-in-from-top-4">
          <div className={`px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 border text-sm font-bold ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-300'
              : 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-500/10 dark:border-orange-500/20 dark:text-orange-300'
          }`}>
            ✓ {toast.message}
          </div>
        </div>
      )}
      <Routes>
        <Route path="home" element={<ClientHome onQuickAction={(action) => {
          if (action === 'apply_loan' || action === 'view_loan_repayments') navigate('/client/calculator');
          if (action === 'view_loan') navigate('/client/loans');
          if (action === 'upload_docs') navigate('/client/documents');
          if (action === 'contact') navigate('/client/contact');
          if (action === 'advisor') navigate('/client/advisor');
        }} />} />
        <Route path="loans" element={
          <ClientLoans
            applications={applications}
            repayments={repayments}
            onPayInstallment={handlePayInstallment}
            onRequestFinancing={() => navigate('/client/calculator')}
          />
        } />
        <Route path="business" element={
          <ClientBusiness onApplyOpportunity={() => navigate('/client/calculator')} />
        } />
        <Route path="messages" element={
          <ClientMessages
            chats={chats}
            alerts={alerts}
            onPayInstallment={handlePayInstallment}
            onClearUnread={handleClearUnread}
          />
        } />
        <Route path="profile" element={
          <ClientProfile
            onLogout={() => {
              logout();
              navigate('/login', { replace: true });
            }}
            onEditDetail={(field) => {
              if (field === 'notifications') navigate('/client/notifications');
              if (field === 'contact') navigate('/client/contact');
              triggerToast(`Navigated to: ${field}`, 'info');
            }}
          />
        } />
        <Route path="calculator" element={
          <ClientLoanCalculator
            onBack={() => navigate('/client/home')}
            onSubmitApplication={handleSubmitApplication}
          />
        } />
        <Route path="documents" element={<DocumentUpload onBack={() => navigate('/client/home')} />} />
        <Route path="notifications" element={<NotificationSettings onBack={() => navigate('/client/profile')} />} />
        <Route path="contact" element={<ContactPinnacle onBack={() => navigate('/client/home')} />} />
        <Route path="advisor" element={<ClientAIAdvisor onBack={() => navigate('/client/home')} />} />
        <Route index element={<Navigate to="home" replace />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Routes>
    </>
  );
}

// ── Admin portal — individual route components (each pulls from AdminDataProvider) ──
function AdminPortalOverview() {
  const { applications, dashboardSummary, selectedAppId, setSelectedAppId, handleDecision } = useAdminData();
  const navigate = useNavigate();
  const selected = selectedAppId ? applications.find(a => a.id === selectedAppId) || null : null;
  if (selected) {
    return (
      <AdminReview
        application={selected}
        onBack={() => setSelectedAppId(null)}
        onUpdateStatus={handleDecision}
      />
    );
  }
  return (
    <AdminOverview
      applications={applications}
      onSelectApplication={(app) => setSelectedAppId(app.id)}
      onNavigateToTab={(tab) => navigate(`/staff/${tab}`)}
      dashboardSummary={dashboardSummary}
    />
  );
}

function AdminPortalCustomers() {
  const { customers, handleAddCustomer } = useAdminData();
  return <AdminCustomers customers={customers} onAddCustomer={handleAddCustomer} />;
}

function AdminPortalReports() {
  const { dashboardSummary, refreshData } = useAdminData();
  return <AdminReports dashboardSummary={dashboardSummary} onSyncSummary={refreshData} />;
}

function AdminPortalSME() { return <AdminSMEPortfolio />; }
function AdminPortalIntelligence() { return <AdminIntelligence />; }
function AdminPortalAnalytics() { return <AdminAnalytics />; }
function AdminPortalPayroll() { return <PayrollPage />; }
function AdminPortalTeam() { return <AdminStaffManagement />; }

// ── Root app ──────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { session, isLoading } = useAuth();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#fcf8f2] dark:bg-[#121212]">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        session ? <Navigate to={session.role !== 'customer' ? '/staff' : '/client'} replace /> : <LoginPage />
      } />
      <Route path="/register" element={
        session ? <Navigate to="/client" replace /> : <RegisterPage />
      } />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/activate" element={<CustomerActivationPage />} />

      {/* Staff login (separate URL) */}
      <Route path="/staff/login" element={
        session && session.role !== 'customer' ? <Navigate to="/staff" replace /> : <LoginPage />
      } />

      {/* Client portal (protected) */}
      <Route path="/client" element={
        <RequireAuth role="client">
          <ClientDataProvider>
            <ClientLayout />
          </ClientDataProvider>
        </RequireAuth>
      }>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="*" element={<ClientPortal />} />
      </Route>

      {/* Staff/Admin portal (protected, separate URL) */}
      <Route
        path="/staff"
        element={
          <RequireAuth role="staff">
            <AdminDataProvider>
              <AdminLayout />
            </AdminDataProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<AdminPortalOverview />} />
        <Route path="customers" element={<AdminPortalCustomers />} />
        <Route path="reports" element={<AdminPortalReports />} />
        <Route path="sme" element={<AdminPortalSME />} />
        <Route path="intelligence" element={<AdminPortalIntelligence />} />
        <Route path="analytics" element={<AdminPortalAnalytics />} />
        <Route path="payroll" element={<AdminPortalPayroll />} />
        <Route path="team" element={<AdminPortalTeam />} />
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Route>

      {/* Root — marketing landing for guests, redirect for authenticated users */}
      <Route path="/" element={
        session
          ? <Navigate to={session.role !== 'customer' ? '/staff' : '/client'} replace />
          : <MarketingPage onEnterApp={() => window.location.href = '/login'} />
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Unhandled app error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-white">
          <div className="max-w-md w-full p-8 bg-white dark:bg-[#1e1e1e] rounded-3xl shadow-xl border border-gray-200 dark:border-white/10 text-center space-y-4">
            <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto text-xl font-black">
              !
            </div>
            <h2 className="text-xl font-bold">Something went wrong</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              An unexpected error occurred while loading this page.
            </p>
            {this.state.error && (
              <div className="p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-xl text-left text-xs font-mono text-red-700 dark:text-red-300 overflow-x-auto max-h-32">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.href = '/';
              }}
              className="w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg transition-colors text-sm"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
