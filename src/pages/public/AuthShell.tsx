import React from 'react';
import { Link } from 'react-router-dom';
import { useBranding } from '../../lib/branding';

/** Centered card layout for sign-in, registration and recovery screens. */
export function AuthShell({ title, subtitle, children, footer, wide }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const branding = useBranding();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="px-4 py-4 sm:px-6">
        <Link to="/" className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-extrabold text-white" aria-hidden>P</span>
          <span className="text-sm font-bold text-ink">{branding?.institutionName ?? 'Pinnacle Financial Services'}</span>
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-4 sm:items-center">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-8">
            <h1 className="text-xl font-bold text-ink sm:text-2xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-4 text-center text-sm text-ink-muted">{footer}</div>}
          {branding?.regulatoryStatement && <p className="mt-6 text-center text-xs text-ink-subtle">{branding.regulatoryStatement}</p>}
        </div>
      </main>
    </div>
  );
}
