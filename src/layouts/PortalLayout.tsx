import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useBranding } from '../lib/branding';
import { useResource } from '../lib/useResource';
import type { NotificationItem } from '../api/types';
import { ROLE_LABELS } from '../lib/format';
import { Badge } from '../ui/Feedback';

export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

function NavList({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {sections.filter(section => section.items.length).map((section, index) => (
        <div key={section.title ?? index}>
          {section.title && <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{section.title}</p>}
          <ul className="space-y-0.5">
            {section.items.map(item => (
              <li key={item.to}>
                <NavLink to={item.to} onClick={onNavigate} end={item.to === '/client' || item.to === '/staff' || item.to === '/staff/settings'}
                  className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-muted hover:bg-surface-muted hover:text-ink'}`}>
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <span className="rounded-full bg-brand-600 px-1.5 text-xs font-bold text-white">{item.badge}</span> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Shared application shell for customers and staff: sidebar from 1024px,
 * top bar with a slide-in menu below that.
 */
export function PortalLayout({ sections, homePath, notificationsPath }: { sections: NavSection[]; homePath: string; notificationsPath: string }) {
  const { profile, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const notifications = useResource<{ unreadCount: number; items: NotificationItem[] }>('/api/notifications');

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const interval = setInterval(() => { void notifications.reload(); }, 60_000);
    return () => clearInterval(interval);
  }, [notifications.reload]);

  const signOut = async () => {
    await logout();
    navigate(profile?.role === 'customer' ? '/login' : '/staff/login', { replace: true });
  };

  const brandMark = (
    <NavLink to={homePath} className="flex min-w-0 items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-extrabold text-white" aria-hidden>P</span>
      <span className="truncate text-sm font-bold text-ink">{branding?.institutionName ?? 'Pinnacle Financial Services'}</span>
    </NavLink>
  );

  const userBlock = profile && (
    <div className="border-t border-line pt-4">
      <p className="truncate text-sm font-semibold text-ink">{profile.fullName}</p>
      <p className="truncate text-xs text-ink-muted">{profile.staffTitle || ROLE_LABELS[profile.role]}</p>
      {profile.isDemoAccount && <Badge tone="warning" className="mt-1">Demo account</Badge>}
      <button type="button" onClick={signOut} className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-muted hover:text-ink">
        <LogOut className="h-4 w-4" aria-hidden /> Sign out
      </button>
    </div>
  );

  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:p-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="mb-6 px-2">{brandMark}</div>
        <div className="min-h-0 flex-1 overflow-y-auto"><NavList sections={sections} /></div>
        {userBlock}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-8">
          <button type="button" className="-ml-1 rounded-lg p-2 text-ink-muted hover:bg-surface-muted lg:hidden" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 lg:hidden">{brandMark}</div>
          <div className="hidden flex-1 lg:block" />
          <NavLink to={notificationsPath} className="relative rounded-lg p-2 text-ink-muted hover:bg-surface-muted" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
            <Bell className="h-5 w-5" aria-hidden />
            {unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-danger-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 9 ? '9+' : unread}</span>}
          </NavLink>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet context={{ refreshNotifications: notifications.reload }} />
        </main>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMenuOpen(false)} aria-hidden />
          <div className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface px-3 py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between px-2">
              {brandMark}
              <button type="button" className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted" aria-label="Close menu" onClick={() => setMenuOpen(false)}>
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><NavList sections={sections} onNavigate={() => setMenuOpen(false)} /></div>
            {userBlock}
          </div>
        </div>
      )}
    </div>
  );
}
