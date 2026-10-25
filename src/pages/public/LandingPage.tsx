import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, FileCheck2, Mail, MapPin, Phone, ShieldCheck, Wallet } from 'lucide-react';
import type { Product } from '../../api/types';
import { useBranding } from '../../lib/branding';
import { CATEGORY_LABELS, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { ButtonLink } from '../../ui/Button';

/** Public landing page. Everything shown comes from the server: available products and the institution's public contact details. */
export function LandingPage() {
  const branding = useBranding();
  const products = useResource<Product[]>('/api/public/products');
  const name = branding?.institutionName ?? 'Pinnacle Financial Services';

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-extrabold text-white" aria-hidden>P</span>
            <span className="truncate text-sm font-bold text-ink">{name}</span>
          </Link>
          <nav className="flex items-center gap-2" aria-label="Account">
            <ButtonLink to="/login" variant="ghost" size="sm">Sign in</ButtonLink>
            <ButtonLink to="/register" size="sm">Apply</ButtonLink>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-extrabold leading-tight text-ink sm:text-4xl">Loans for salaried employees and growing businesses.</h1>
            <p className="mt-4 text-base text-ink-muted sm:text-lg">
              Apply online, upload your documents securely, and follow every step of your application — from review to disbursement and repayment.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ButtonLink to="/register" size="lg" icon={<ArrowRight className="h-5 w-5" />}>Create an account</ButtonLink>
              <ButtonLink to="/activate" size="lg" variant="secondary">I’m an existing client</ButtonLink>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {[
              { icon: FileCheck2, title: 'Apply and upload online', text: 'Your ID, payslips and business documents go straight to your file for our officers to review.' },
              { icon: Wallet, title: 'Clear costs before you commit', text: 'Your offer shows the installment, total repayable and every fee. Nothing is final until you accept.' },
              { icon: ShieldCheck, title: 'Your information is protected', text: 'Documents are stored privately and opened only by authorised staff. Every access is recorded.' },
            ].map(item => (
              <div key={item.title}>
                <item.icon className="h-6 w-6 text-brand-700" aria-hidden />
                <h2 className="mt-3 font-semibold text-ink">{item.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="text-xl font-bold text-ink sm:text-2xl">Loan products</h2>
          {products.loading && <p className="mt-4 text-sm text-ink-muted">Loading products…</p>}
          {products.data && products.data.length === 0 && (
            <p className="mt-4 max-w-xl text-sm text-ink-muted">Online applications open as products are published. Contact us to discuss your financing needs.</p>
          )}
          {products.data && products.data.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {products.data.map(product => (
                <li key={product.id} className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    {product.borrowerType === 'business' ? <Building2 className="h-4 w-4" aria-hidden /> : <Wallet className="h-4 w-4" aria-hidden />}
                    {CATEGORY_LABELS[product.category] ?? product.category}
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{product.name}</h3>
                  <p className="mt-1 flex-1 text-sm text-ink-muted">{product.description}</p>
                  {product.minAmount !== null && product.maxAmount !== null && (
                    <p className="mt-3 text-sm text-ink">{money(product.minAmount, { compact: true })} – {money(product.maxAmount, { compact: true })}</p>
                  )}
                  {product.membersOnly && <p className="mt-1 text-xs text-ink-subtle">For eligible members</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-ink-muted sm:grid-cols-2 sm:px-6">
          <div>
            <p className="font-semibold text-ink">{branding?.legalName ?? name}</p>
            {branding?.regulatoryStatement && <p className="mt-1">{branding.regulatoryStatement}</p>}
          </div>
          <ul className="space-y-1.5">
            {branding?.supportPhone && <li className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0" aria-hidden /> {branding.supportPhone}{branding.tollFree ? ` · Toll free ${branding.tollFree}` : ''}</li>}
            {branding?.supportEmail && <li className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0" aria-hidden /> <a className="hover:underline" href={`mailto:${branding.supportEmail}`}>{branding.supportEmail}</a></li>}
            {branding?.offices?.map(office => (
              <li key={office.address} className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{office.city}: {office.address}</span></li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
