import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import {
  BarChart3, Bell, BookOpen, Bot, Briefcase, Building2, ClipboardList, FileText, Home, LayoutDashboard, MessageSquare,
  Package, ScrollText, Settings, ShieldCheck, Upload, Users, Wallet, BadgeCheck,
} from 'lucide-react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './ui/Toast';
import { LoadingBlock } from './ui/Feedback';
import { PortalLayout, type NavSection } from './layouts/PortalLayout';
import { LandingPage } from './pages/public/LandingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { ActivatePage, ForgotPasswordPage } from './pages/public/RecoveryPages';
import { ClientHome } from './pages/client/ClientHome';
import { ApplyPage } from './pages/client/ApplyPage';
import { ClientApplicationDetail, ClientApplications } from './pages/client/ClientApplications';
import { ClientDocuments } from './pages/client/ClientDocuments';
import { BusinessDetailPage, ClientBusinessList, NewBusinessPage, StaffBusinessList } from './features/businesses/Businesses';
import { MessagesPage } from './features/messages/Messages';
import { AssistantPage } from './features/assistant/AssistantPage';
import { NotificationsPage } from './features/account/NotificationsPage';
import { SettingsPage } from './features/account/SettingsPage';
import { StaffOverview } from './pages/staff/StaffOverview';
import { StaffApplications } from './pages/staff/StaffApplications';
import { ApplicationReview } from './pages/staff/ApplicationReview';
import { StaffCustomerDetail, StaffCustomers, StaffMembers } from './pages/staff/StaffCustomers';
import { StaffTransactions } from './pages/staff/StaffTransactions';
import { StaffPayroll } from './pages/staff/StaffPayroll';
import { StaffReports } from './pages/staff/StaffReports';
import { StaffProducts } from './pages/staff/StaffProducts';
import { StaffAdmin } from './pages/staff/StaffAdmin';
import { StaffAudit, StaffKnowledge, StaffSettings } from './pages/staff/StaffSystem';

function RequireRole({ staff, children }: { staff: boolean; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="min-h-dvh"><LoadingBlock /></div>;
  if (!profile) return <Navigate to={staff ? '/staff/login' : '/login'} state={{ from: location.pathname }} replace />;
  const isStaff = profile.role !== 'customer';
  if (staff !== isStaff) return <Navigate to={isStaff ? '/staff' : '/client'} replace />;
  // Accounts with a temporary password must change it first.
  if (profile.mustChangePassword && !location.pathname.endsWith('/settings')) return <Navigate to={staff ? '/staff/settings' : '/client/settings'} replace />;
  return <>{children}</>;
}

/** Only shows a staff page to people holding the permission it needs. The API enforces the same rule. */
function Allow({ permission, children }: { permission: string | string[]; children: React.ReactNode }) {
  const { can } = useAuth();
  const needed = Array.isArray(permission) ? permission : [permission];
  if (!needed.some(item => can(item))) return <Navigate to="/staff" replace />;
  return <>{children}</>;
}

const CLIENT_NAV: NavSection[] = [
  { items: [
    { to: '/client', label: 'Home', icon: Home },
    { to: '/client/applications', label: 'My applications', icon: ClipboardList },
    { to: '/client/apply', label: 'Apply for a loan', icon: Wallet },
    { to: '/client/businesses', label: 'My businesses', icon: Building2 },
    { to: '/client/documents', label: 'Documents', icon: FileText },
  ] },
  { title: 'Help', items: [
    { to: '/client/messages', label: 'Messages', icon: MessageSquare },
    { to: '/client/assistant', label: 'Assistant', icon: Bot },
    { to: '/client/notifications', label: 'Notifications', icon: Bell },
    { to: '/client/settings', label: 'Settings', icon: Settings },
  ] },
];

function StaffPortal() {
  const { can } = useAuth();
  const any = (...permissions: string[]) => permissions.some(permission => can(permission));
  const nav: NavSection[] = [
    { items: [
      { to: '/staff', label: 'Overview', icon: LayoutDashboard },
      { to: '/staff/applications', label: 'Applications', icon: ClipboardList },
      ...(any('disbursements.record', 'disbursements.confirm', 'repayments.record', 'repayments.confirm') ? [{ to: '/staff/transactions', label: 'Transactions', icon: Wallet }] : []),
    ] },
    { title: 'Clients', items: [
      ...(can('customers.view') ? [{ to: '/staff/customers', label: 'Customers', icon: Users }] : []),
      ...(can('members.view') ? [{ to: '/staff/members', label: 'Member register', icon: BadgeCheck }] : []),
      ...(can('businesses.view') ? [{ to: '/staff/businesses', label: 'SME businesses', icon: Briefcase }] : []),
      ...(can('customers.view') ? [{ to: '/staff/messages', label: 'Messages', icon: MessageSquare }] : []),
    ] },
    { title: 'Insight', items: [
      ...(any('reports.view', 'reports.sme') ? [{ to: '/staff/reports', label: 'Reports', icon: BarChart3 }] : []),
      ...(can('payroll.manage') ? [{ to: '/staff/payroll', label: 'Payroll deductions', icon: Upload }] : []),
      { to: '/staff/assistant', label: 'Assistant', icon: Bot },
    ] },
    { title: 'Administration', items: [
      ...(can('products.manage') ? [{ to: '/staff/products', label: 'Loan products', icon: Package }] : []),
      ...(any('staff.manage', 'permissions.manage') ? [{ to: '/staff/team', label: 'Staff & permissions', icon: ShieldCheck }] : []),
      ...(can('knowledge.manage') ? [{ to: '/staff/knowledge', label: 'Assistant knowledge', icon: BookOpen }] : []),
      ...(can('audit.view') ? [{ to: '/staff/audit', label: 'Audit log', icon: ScrollText }] : []),
      ...(can('settings.manage') ? [{ to: '/staff/settings/institution', label: 'Institution settings', icon: Settings }] : []),
    ] },
    { items: [{ to: '/staff/settings', label: 'My account', icon: Settings }] },
  ];
  return <PortalLayout sections={nav} homePath="/staff" notificationsPath="/staff/notifications" />;
}

function AppRoutes() {
  const { profile, loading } = useAuth();
  if (loading) return <div className="min-h-dvh"><LoadingBlock /></div>;
  const home = profile ? (profile.role === 'customer' ? '/client' : '/staff') : null;
  return (
    <Routes>
      <Route path="/" element={home ? <Navigate to={home} replace /> : <LandingPage />} />
      <Route path="/login" element={home ? <Navigate to={home} replace /> : <LoginPage />} />
      <Route path="/staff/login" element={home ? <Navigate to={home} replace /> : <LoginPage staff />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/activate" element={home ? <Navigate to={home} replace /> : <ActivatePage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route path="/client" element={<RequireRole staff={false}><PortalLayout sections={CLIENT_NAV} homePath="/client" notificationsPath="/client/notifications" /></RequireRole>}>
        <Route index element={<ClientHome />} />
        <Route path="apply" element={<ApplyPage />} />
        <Route path="applications" element={<ClientApplications />} />
        <Route path="applications/:id" element={<ClientApplicationDetail />} />
        <Route path="businesses" element={<ClientBusinessList />} />
        <Route path="businesses/new" element={<NewBusinessPage />} />
        <Route path="businesses/:id" element={<BusinessDetailPage />} />
        <Route path="business/:id" element={<BusinessDetailPage />} />
        <Route path="documents" element={<ClientDocuments />} />
        <Route path="messages" element={<MessagesPage />} />
        <Route path="messages/:id" element={<MessagesPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="profile" element={<Navigate to="/client/settings" replace />} />
        <Route path="*" element={<Navigate to="/client" replace />} />
      </Route>

      <Route path="/staff" element={<RequireRole staff><StaffPortal /></RequireRole>}>
        <Route index element={<StaffOverview />} />
        <Route path="applications" element={<StaffApplications />} />
        <Route path="applications/:id" element={<ApplicationReview />} />
        <Route path="transactions" element={<Allow permission={['disbursements.record', 'disbursements.confirm', 'repayments.record', 'repayments.confirm']}><StaffTransactions /></Allow>} />
        <Route path="customers" element={<Allow permission="customers.view"><StaffCustomers /></Allow>} />
        <Route path="customers/:id" element={<Allow permission="customers.view"><StaffCustomerDetail /></Allow>} />
        <Route path="members" element={<Allow permission="members.view"><StaffMembers /></Allow>} />
        <Route path="businesses" element={<Allow permission="businesses.view"><StaffBusinessList /></Allow>} />
        <Route path="businesses/new" element={<Allow permission="businesses.manage"><NewBusinessPage /></Allow>} />
        <Route path="businesses/:id" element={<Allow permission="businesses.view"><BusinessDetailPage /></Allow>} />
        <Route path="messages" element={<Allow permission="customers.view"><MessagesPage /></Allow>} />
        <Route path="messages/:id" element={<Allow permission="customers.view"><MessagesPage /></Allow>} />
        <Route path="reports" element={<Allow permission={['reports.view', 'reports.sme']}><StaffReports /></Allow>} />
        <Route path="payroll" element={<Allow permission="payroll.manage"><StaffPayroll /></Allow>} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="products" element={<Allow permission="products.manage"><StaffProducts /></Allow>} />
        <Route path="team" element={<Allow permission={['staff.manage', 'permissions.manage']}><StaffAdmin /></Allow>} />
        <Route path="knowledge" element={<Allow permission="knowledge.manage"><StaffKnowledge /></Allow>} />
        <Route path="audit" element={<Allow permission="audit.view"><StaffAudit /></Allow>} />
        <Route path="settings/institution" element={<Allow permission="settings.manage"><StaffSettings /></Allow>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="*" element={<Navigate to="/staff" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-ink-muted">Please reload the page. If it keeps happening, contact support.</p>
          <button type="button" className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
