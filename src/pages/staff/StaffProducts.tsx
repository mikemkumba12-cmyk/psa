import React, { useState } from 'react';
import { PlusCircle, Trash2 } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { Product, ProductFee } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { CATEGORY_LABELS, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, DemoBadge, StatusBadge } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { Checkbox, FormErrorSummary, FormGrid, MoneyInput, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { Modal } from '../../ui/Modal';
import { useDocumentTypes } from '../../features/documents/Documents';
import { useToast } from '../../ui/Toast';

export function StaffProducts() {
  const { can } = useAuth();
  const { data, error, loading, reload } = useResource<Product[]>('/api/products');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const manage = can('products.manage');
  return (
    <>
      <PageHeader title="Loan products" description="Only active products with confirmed terms are offered to customers. Rates and fees are never assumed."
        actions={manage && <Button icon={<PlusCircle className="h-4 w-4" />} onClick={() => setEditing('new')}>New product</Button>} />
      <Card padded={false}>
        <DataTable caption="Loan products" rows={data} loading={loading} error={error} onRetry={reload} rowKey={row => row.id}
          onRowClick={manage ? row => setEditing(row) : undefined} empty={{ title: 'No products' }}
          columns={[
            { key: 'name', header: 'Product', mobile: 'title', className: 'w-[28%]', render: row => <>{row.name} <DemoBadge show={row.isDemo} /><span className="block text-xs text-ink-muted">{CATEGORY_LABELS[row.category]} · {row.borrowerType}</span></> },
            { key: 'amount', header: 'Amount', render: row => row.minAmount !== null ? `${money(row.minAmount, { compact: true })} – ${money(row.maxAmount, { compact: true })}` : '—' },
            { key: 'term', header: 'Term', render: row => row.minTermMonths !== null ? `${row.minTermMonths}–${row.maxTermMonths} mo` : '—' },
            { key: 'rate', header: 'Rate / month', render: row => row.interestRateMonthly !== null ? `${row.interestRateMonthly}%` : <span className="text-danger-700">Not set</span> },
            { key: 'status', header: 'Status', render: row => <><StatusBadge status={row.status} />{row.status === 'active' && !row.isAvailable && <Badge tone="warning">Not offered</Badge>}</> },
          ]} />
      </Card>
      {editing && <ProductEditor product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void reload(); }} />}
    </>
  );
}

function ProductEditor({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const types = useDocumentTypes();
  const [form, setForm] = useState({
    code: product?.code ?? '', category: product?.category ?? 'working_capital', borrowerType: product?.borrowerType ?? 'business',
    name: product?.name ?? '', description: product?.description ?? '',
    minAmount: product?.minAmount ?? ('' as number | ''), maxAmount: product?.maxAmount ?? ('' as number | ''),
    minTermMonths: product?.minTermMonths ?? ('' as number | ''), maxTermMonths: product?.maxTermMonths ?? ('' as number | ''),
    interestMethod: product?.interestMethod ?? 'reducing_balance', interestRateMonthly: product?.interestRateMonthly ?? ('' as number | ''),
    repaymentFrequency: product?.repaymentFrequency ?? 'monthly', fees: product?.fees ?? ([] as ProductFee[]),
    requiredDocuments: product?.requiredDocuments ?? [], membersOnly: product?.membersOnly ?? true, collateralRequired: product?.collateralRequired ?? false,
    collateralNotes: product?.collateralNotes ?? '', termsConfirmed: product?.termsConfirmed ?? false,
    effectiveFrom: product?.effectiveFrom ?? '', effectiveTo: product?.effectiveTo ?? '', status: product?.status ?? 'draft',
  });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const nul = (value: number | '' | string) => (value === '' ? null : value);

  const save = async () => {
    setPending(true);
    setError(null);
    const shared = {
      name: form.name, description: form.description, minAmount: nul(form.minAmount), maxAmount: nul(form.maxAmount),
      minTermMonths: nul(form.minTermMonths), maxTermMonths: nul(form.maxTermMonths), interestMethod: form.interestMethod,
      interestRateMonthly: nul(form.interestRateMonthly), repaymentFrequency: form.repaymentFrequency, fees: form.fees,
      requiredDocuments: form.requiredDocuments, membersOnly: form.membersOnly, collateralRequired: form.collateralRequired,
      collateralNotes: form.collateralNotes || null, termsConfirmed: form.termsConfirmed, effectiveFrom: nul(form.effectiveFrom), effectiveTo: nul(form.effectiveTo),
    };
    try {
      if (product) await api(`/api/products/${product.id}`, { method: 'PATCH', body: { ...shared, status: form.status } });
      else await api('/api/products', { body: { ...shared, code: form.code, category: form.category, borrowerType: form.borrowerType } });
      toast('Product saved.');
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };

  const setFee = (index: number, patch: Partial<ProductFee>) => setForm(current => ({ ...current, fees: current.fees.map((fee, position) => position === index ? { ...fee, ...patch } : fee) }));
  const toggleDoc = (code: string) => setForm(current => ({ ...current, requiredDocuments: current.requiredDocuments.includes(code) ? current.requiredDocuments.filter(item => item !== code) : [...current.requiredDocuments, code] }));

  return (
    <Modal open onClose={onClose} size="xl" title={product ? `Edit ${product.name}` : 'New product'}
      description="Changes apply to new applications. Submitted applications keep the terms captured when they were submitted."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Save</Button></>}>
      <div className="space-y-6">
        <FormErrorSummary message={error?.message} details={error?.details} />
        {product?.activationBlockers && product.activationBlockers.length > 0 && (
          <Alert tone="warning" title="Before this product can be activated"><ul className="list-disc pl-5">{product.activationBlockers.map(item => <li key={item}>{item}</li>)}</ul></Alert>
        )}
        <section>
          <h3 className="mb-3 text-sm font-semibold">Basics</h3>
          <FormGrid columns={3}>
            {!product && <TextInput label="Code" required value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} hint="e.g. WORKING_CAPITAL_2" />}
            {!product && <Select label="Category" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} options={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))} />}
            {!product && <Select label="Borrower" value={form.borrowerType} onChange={event => setForm({ ...form, borrowerType: event.target.value as 'individual' | 'business' })} options={[{ value: 'individual', label: 'Individual' }, { value: 'business', label: 'Business' }]} />}
            <TextInput label="Name" required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
            {product && <Select label="Status" value={form.status} onChange={event => setForm({ ...form, status: event.target.value as Product['status'] })} options={['draft', 'active', 'suspended', 'retired'].map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} />}
          </FormGrid>
          <div className="mt-4"><TextArea label="Description" rows={2} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold">Terms</h3>
          <FormGrid columns={3}>
            <MoneyInput label="Minimum amount" value={form.minAmount} onValueChange={value => setForm({ ...form, minAmount: value })} />
            <MoneyInput label="Maximum amount" value={form.maxAmount} onValueChange={value => setForm({ ...form, maxAmount: value })} />
            <TextInput label="Interest rate (% per month)" type="number" step="0.0001" min={0} value={form.interestRateMonthly} onChange={event => setForm({ ...form, interestRateMonthly: event.target.value === '' ? '' : Number(event.target.value) })} />
            <TextInput label="Minimum term (months)" type="number" min={1} value={form.minTermMonths} onChange={event => setForm({ ...form, minTermMonths: event.target.value === '' ? '' : Number(event.target.value) })} />
            <TextInput label="Maximum term (months)" type="number" min={1} value={form.maxTermMonths} onChange={event => setForm({ ...form, maxTermMonths: event.target.value === '' ? '' : Number(event.target.value) })} />
            <Select label="Interest method" value={form.interestMethod} onChange={event => setForm({ ...form, interestMethod: event.target.value as Product['interestMethod'] })} options={[{ value: 'reducing_balance', label: 'Reducing balance' }, { value: 'flat', label: 'Flat' }]} />
            <Select label="Repayment" value={form.repaymentFrequency} onChange={event => setForm({ ...form, repaymentFrequency: event.target.value as Product['repaymentFrequency'] })} options={[{ value: 'monthly', label: 'Monthly installments' }, { value: 'bullet', label: 'Single repayment at maturity' }]} />
            <TextInput label="Effective from" type="date" value={form.effectiveFrom ?? ''} onChange={event => setForm({ ...form, effectiveFrom: event.target.value })} />
            <TextInput label="Effective to" type="date" value={form.effectiveTo ?? ''} onChange={event => setForm({ ...form, effectiveTo: event.target.value })} />
          </FormGrid>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Fees</h3>
            <Button size="sm" variant="secondary" onClick={() => setForm(current => ({ ...current, fees: [...current.fees, { name: '', type: 'percent', value: 0, deductedFromDisbursement: true }] }))}>Add fee</Button>
          </div>
          {form.fees.length === 0 && <p className="text-sm text-ink-muted">No fees.</p>}
          <div className="space-y-3">
            {form.fees.map((fee, index) => (
              <div key={index} className="grid grid-cols-1 gap-3 rounded-lg border border-line p-3 md:grid-cols-[1fr_10rem_10rem_auto] md:items-end">
                <TextInput label="Fee name" value={fee.name} onChange={event => setFee(index, { name: event.target.value })} />
                <Select label="Type" value={fee.type} onChange={event => setFee(index, { type: event.target.value as ProductFee['type'] })} options={[{ value: 'percent', label: '% of amount' }, { value: 'fixed', label: 'Fixed MWK' }]} />
                <TextInput label="Value" type="number" min={0} step="any" value={fee.value} onChange={event => setFee(index, { value: Number(event.target.value) })} />
                <div className="flex items-center gap-2 pb-2">
                  <Checkbox label="Deducted" checked={fee.deductedFromDisbursement} onChange={checked => setFee(index, { deductedFromDisbursement: checked })} />
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} aria-label="Remove fee" onClick={() => setForm(current => ({ ...current, fees: current.fees.filter((_, position) => position !== index) }))} />
                </div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold">Required documents</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {types?.types.map(type => <Checkbox key={type.code} label={type.label} checked={form.requiredDocuments.includes(type.code)} onChange={() => toggleDoc(type.code)} />)}
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Eligibility and security</h3>
          <Checkbox label="Eligible members only" description="Membership is checked against the member register on submission and approval." checked={form.membersOnly} onChange={value => setForm({ ...form, membersOnly: value })} />
          <Checkbox label="Collateral or security required" checked={form.collateralRequired} onChange={value => setForm({ ...form, collateralRequired: value })} />
          {form.collateralRequired && <TextArea label="Security requirements" rows={2} value={form.collateralNotes} onChange={event => setForm({ ...form, collateralNotes: event.target.value })} />}
        </section>
        <section className="rounded-lg border border-warning-700/20 bg-warning-50 p-4">
          <Checkbox label="These terms have been approved by the institution" description="Required before the product can be offered. Do not tick this for figures copied from elsewhere."
            checked={form.termsConfirmed} onChange={value => setForm({ ...form, termsConfirmed: value })} />
        </section>
      </div>
    </Modal>
  );
}
