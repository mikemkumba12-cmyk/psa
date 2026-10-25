import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, FileText, MessageSquare, PlusCircle } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import type { ApplicationSummary, Paged, StoredDocument } from '../../api/types';
import { date, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { ButtonLink } from '../../ui/Button';
import { Alert, EmptyState, LoadingBlock, StatusBadge } from '../../ui/Feedback';
import { Card, PageHeader } from '../../ui/Layout';

/** What the customer should do next comes first, then their applications. */
export function ClientHome() {
  const { profile } = useAuth();
  const apps = useResource<Paged<ApplicationSummary>>('/api/applications?pageSize=10');
  const docs = useResource<StoredDocument[]>('/api/documents');

  const actions: Array<{ tone: 'warning' | 'info' | 'danger'; title: string; text: string; to: string; cta: string }> = [];
  const idTypes = ['national_id_front', 'national_id_back'];
  if (docs.data) {
    const missing = idTypes.filter(code => !docs.data!.some(doc => doc.documentType === code && doc.status !== 'rejected'));
    const rejected = docs.data.filter(doc => doc.status === 'rejected');
    if (missing.length) actions.push({ tone: 'warning', title: 'Upload your national ID', text: 'We need both sides of your ID before we can review any application.', to: '/client/documents', cta: 'Upload ID' });
    for (const doc of rejected) actions.push({ tone: 'danger', title: `${doc.documentTypeLabel} needs replacing`, text: doc.reviewNote ?? 'It could not be accepted.', to: '/client/documents', cta: 'Replace' });
  }
  for (const app of apps.data?.items ?? []) {
    if (app.status === 'info_requested') actions.push({ tone: 'warning', title: `${app.reference}: more information needed`, text: 'Your loan officer has asked for more details.', to: `/client/applications/${app.id}`, cta: 'Respond' });
    if (app.status === 'offer_issued') actions.push({ tone: 'info', title: `${app.reference}: your offer is ready`, text: 'Review the terms and accept or decline.', to: `/client/applications/${app.id}`, cta: 'View offer' });
    if (app.status === 'draft') actions.push({ tone: 'info', title: `${app.reference}: not yet submitted`, text: 'Finish your application to send it for review.', to: `/client/applications/${app.id}`, cta: 'Continue' });
  }
  const active = apps.data?.items.filter(app => app.status === 'disbursed') ?? [];

  return (
    <>
      <PageHeader title={`Hello, ${profile?.fullName.split(' ')[0] ?? ''}`} description="Here’s where things stand."
        actions={<ButtonLink to="/client/apply" icon={<PlusCircle className="h-4 w-4" />}>Apply for a loan</ButtonLink>} />

      {actions.length > 0 && (
        <section aria-labelledby="todo" className="mb-6 space-y-2">
          <h2 id="todo" className="text-sm font-semibold uppercase tracking-wide text-ink-subtle">To do</h2>
          {actions.map(action => (
            <Alert key={action.title} tone={action.tone} title={action.title}
              action={<ButtonLink to={action.to} size="sm" variant="secondary">{action.cta}</ButtonLink>}>{action.text}</Alert>
          ))}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {active.length > 0 && (
            <Card title="Active loans">
              <ul className="divide-y divide-line">
                {active.map(app => (
                  <li key={app.id}>
                    <Link to={`/client/applications/${app.id}`} className="flex items-center justify-between gap-3 py-3 hover:text-brand-700">
                      <div className="min-w-0">
                        <p className="font-semibold">{app.productName}</p>
                        <p className="text-sm text-ink-muted">{app.reference} · {money(app.approvedAmount ?? app.amount)}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title="My applications" actions={<Link className="text-sm font-semibold text-brand-700 hover:underline" to="/client/applications">See all</Link>} padded={false}>
            {apps.loading && !apps.data && <LoadingBlock />}
            {apps.error && <div className="p-4"><Alert tone="danger">{apps.error.message}</Alert></div>}
            {apps.data && apps.data.items.length === 0 && (
              <EmptyState title="No applications yet" action={<ButtonLink to="/client/apply">Start an application</ButtonLink>}>
                Choose a product, tell us what the loan is for, and upload your documents.
              </EmptyState>
            )}
            {apps.data && apps.data.items.length > 0 && (
              <ul className="divide-y divide-line">
                {apps.data.items.slice(0, 5).map(app => (
                  <li key={app.id}>
                    <Link to={`/client/applications/${app.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-muted sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">{app.productName}{app.businessName ? ` · ${app.businessName}` : ''}</p>
                        <p className="text-sm text-ink-muted">{app.reference} · {money(app.amount)} · {app.termMonths} months · {date(app.submittedAt ?? app.createdAt)}</p>
                      </div>
                      <StatusBadge status={app.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Membership">
            {profile?.customer?.membership
              ? <p className="text-sm text-ink">Member {profile.customer.membership.memberNumber} · <StatusBadge status={profile.customer.membership.status} /></p>
              : <p className="text-sm text-ink-muted">No membership on record. Business financing is for eligible members. <Link className="font-semibold text-brand-700 hover:underline" to="/client/settings">Add your member number</Link>.</p>}
          </Card>
          <Card title="Shortcuts">
            <ul className="space-y-1 text-sm">
              {[
                { to: '/client/documents', icon: FileText, label: 'My documents' },
                { to: '/client/businesses', icon: Building2, label: 'My businesses' },
                { to: '/client/messages', icon: MessageSquare, label: 'Message a loan officer' },
              ].map(item => (
                <li key={item.to}>
                  <Link to={item.to} className="flex items-center gap-3 rounded-lg px-2 py-2 font-medium text-ink hover:bg-surface-muted">
                    <item.icon className="h-4 w-4 text-ink-subtle" aria-hidden /> {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
