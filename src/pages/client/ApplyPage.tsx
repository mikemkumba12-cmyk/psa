import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Wallet } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { ApplicationDetail, Business, Paged, Product, Quote } from '../../api/types';
import { CATEGORY_LABELS, money } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button, ButtonLink } from '../../ui/Button';
import { Alert, EmptyState, ErrorState, LoadingBlock } from '../../ui/Feedback';
import { FormErrorSummary, FormGrid, MoneyInput, Select, TextArea, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';

/**
 * Step 1 of an application: product, amount, term, purpose and declared figures.
 * Saving creates a draft; documents and submission continue on the application page.
 */
export function ApplyPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const products = useResource<Product[]>('/api/products');
  const businesses = useResource<Paged<Business>>('/api/businesses');
  const [productId, setProductId] = useState(params.get('product') ?? '');
  const [businessId, setBusinessId] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [termMonths, setTermMonths] = useState<number | ''>('');
  const [purpose, setPurpose] = useState('');
  const [declared, setDeclared] = useState<Record<string, number | string | ''>>({});
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);

  const product = products.data?.find(item => item.id === productId);
  const eligibleBusinesses = useMemo(
    () => businesses.data?.items.filter(item => item.myRoles?.some(role => ['owner', 'director', 'representative'].includes(role))) ?? [],
    [businesses.data],
  );

  useEffect(() => {
    if (!product) return;
    setAmount(current => current === '' ? '' : current);
    setTermMonths(current => current === '' ? product.minTermMonths ?? '' : current);
  }, [product]);

  // Live repayment estimate from the product's configured terms.
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
    if (!product || amount === '' || termMonths === '' || amount <= 0) return;
    const timer = setTimeout(() => {
      api<Quote>(`/api/products/${product.id}/quote`, { body: { amount, termMonths } })
        .then(setQuote)
        .catch(caught => setQuoteError(caught instanceof ApiError ? (caught.details[0]?.message ?? caught.message) : 'Could not calculate an estimate.'));
    }, 350);
    return () => clearTimeout(timer);
  }, [product, amount, termMonths]);

  const setDeclaredValue = (key: string, value: number | string | '') => setDeclared(current => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!product || amount === '' || termMonths === '') return;
    setPending(true);
    setError(null);
    const clean = Object.fromEntries(Object.entries(declared).filter(([, value]) => value !== '' && value !== undefined));
    try {
      const created = await api<ApplicationDetail>('/api/applications', {
        body: { productId: product.id, businessId: product.borrowerType === 'business' ? businessId : undefined, amount, termMonths, purpose, declared: clean },
      });
      navigate(`/client/applications/${created.id}`, { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save the application.'));
    } finally {
      setPending(false);
    }
  };

  if (products.error) return <ErrorState error={products.error} onRetry={products.reload} />;
  if (!products.data) return <LoadingBlock />;
  if (!products.data.length) {
    return (
      <>
        <PageHeader title="Apply for a loan" />
        <Card><EmptyState title="No products are open for online applications right now">Please contact the branch or send us a message.</EmptyState></Card>
      </>
    );
  }

  const fieldErrors = error?.fieldErrors() ?? {};
  const category = product?.category;

  return (
    <>
      <PageHeader title="Apply for a loan" description="You can save and finish later. Nothing is sent for review until you submit." back={{ to: '/client', label: 'Home' }} />
      <form onSubmit={submit} className="space-y-6">
        <Card title="1. Choose a product">
          <fieldset>
            <legend className="sr-only">Loan product</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {products.data.map(item => (
                <label key={item.id} className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors ${productId === item.id ? 'border-brand-600 bg-brand-50' : 'border-line hover:border-line-strong'}`}>
                  <input type="radio" name="product" value={item.id} checked={productId === item.id} onChange={() => { setProductId(item.id); setDeclared({}); }} className="mt-1 h-4 w-4 accent-brand-600" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                      {item.borrowerType === 'business' ? <Building2 className="h-3.5 w-3.5" aria-hidden /> : <Wallet className="h-3.5 w-3.5" aria-hidden />}
                      {CATEGORY_LABELS[item.category] ?? item.category}{item.isDemo ? ' · demo' : ''}
                    </span>
                    <span className="mt-1 block font-semibold text-ink">{item.name}</span>
                    <span className="mt-0.5 block text-sm text-ink-muted">{item.description}</span>
                    <span className="mt-2 block text-sm text-ink">{money(item.minAmount, { compact: true })} – {money(item.maxAmount, { compact: true })} · {item.minTermMonths}–{item.maxTermMonths} months</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        {product && (
          <Card title="2. Amount and purpose">
            <div className="space-y-4">
              {product.borrowerType === 'business' && (
                businesses.data && eligibleBusinesses.length === 0 ? (
                  <Alert tone="warning" title="Add your business first" action={<ButtonLink to="/client/businesses/new" size="sm" variant="secondary">Add business</ButtonLink>}>
                    {product.name} is for businesses. Create a business profile where you are an owner, director or authorised representative.
                  </Alert>
                ) : (
                  <Select label="Business applying" required value={businessId} onChange={event => setBusinessId(event.target.value)} placeholder="Choose a business…"
                    options={eligibleBusinesses.map(item => ({ value: item.id, label: item.registeredName }))} error={fieldErrors.businessId} />
                )
              )}
              {product.membersOnly && <Alert tone="info">This product is for eligible members. Your membership is checked when you submit.</Alert>}
              <FormGrid>
                <MoneyInput label="Amount" required value={amount} onValueChange={setAmount} error={fieldErrors.amount}
                  hint={`${money(product.minAmount)} to ${money(product.maxAmount)}`} />
                <Select label={product.repaymentFrequency === 'bullet' ? 'Repay after' : 'Repayment period'} required value={String(termMonths)} onChange={event => setTermMonths(Number(event.target.value))}
                  error={fieldErrors.termMonths}
                  options={Array.from({ length: (product.maxTermMonths ?? 1) - (product.minTermMonths ?? 1) + 1 }, (_, index) => {
                    const months = (product.minTermMonths ?? 1) + index;
                    return { value: String(months), label: `${months} month${months === 1 ? '' : 's'}` };
                  })} />
              </FormGrid>
              <TextArea label="What is the loan for?" required rows={3} value={purpose} onChange={event => setPurpose(event.target.value)} error={fieldErrors.purpose} />

              {product.borrowerType === 'individual' && (
                <FormGrid>
                  <MoneyInput label="Monthly net income" required value={declared.monthlyNetIncome as number | ''} onValueChange={value => setDeclaredValue('monthlyNetIncome', value)} hint="Take-home pay after tax and deductions." />
                  <MoneyInput label="Existing monthly loan deductions" value={declared.existingMonthlyDeductions as number | ''} onValueChange={value => setDeclaredValue('existingMonthlyDeductions', value)} hint="Repayments to other lenders." />
                </FormGrid>
              )}
              {(category === 'invoice_discounting' || category === 'order_financing') && (
                <FormGrid>
                  <MoneyInput label={category === 'invoice_discounting' ? 'Invoice value' : 'Order value'} required value={declared.expectedProceeds as number | ''} onValueChange={value => setDeclaredValue('expectedProceeds', value)} />
                  <TextInput label={category === 'invoice_discounting' ? 'Customer being invoiced' : 'Customer who placed the order'} value={(declared.counterpartyName as string) ?? ''} onChange={event => setDeclaredValue('counterpartyName', event.target.value)} />
                  <TextInput label={category === 'invoice_discounting' ? 'Invoice number' : 'Order / contract number'} value={(declared.documentReference as string) ?? ''} onChange={event => setDeclaredValue('documentReference', event.target.value)} />
                </FormGrid>
              )}
              {category === 'asset_financing' && (
                <TextArea label="Asset to be financed" rows={2} value={(declared.assetDescription as string) ?? ''} onChange={event => setDeclaredValue('assetDescription', event.target.value)} hint="Make, model and supplier." />
              )}
              {product.collateralRequired && (
                <TextArea label="Security offered" rows={2} value={(declared.collateralDescription as string) ?? ''} onChange={event => setDeclaredValue('collateralDescription', event.target.value)} hint={product.collateralNotes ?? undefined} />
              )}
            </div>
          </Card>
        )}

        {product && (
          <Card title="Estimated repayments" description="Based on the product’s published terms. Your offer is confirmed after assessment.">
            {quoteError && <Alert tone="warning">{quoteError}</Alert>}
            {!quote && !quoteError && <p className="text-sm text-ink-muted">Enter an amount to see an estimate.</p>}
            {quote && (
              <dl className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-4">
                <div><dt className="text-xs text-ink-subtle">{quote.repaymentFrequency === 'bullet' ? 'Single repayment' : 'Monthly installment'}</dt><dd className="text-lg font-bold tabular-nums">{money(quote.installmentAmount)}</dd></div>
                <div><dt className="text-xs text-ink-subtle">Total repayable</dt><dd className="text-lg font-bold tabular-nums">{money(quote.totalRepayable)}</dd></div>
                <div><dt className="text-xs text-ink-subtle">Fees</dt><dd className="text-lg font-bold tabular-nums">{money(quote.totalFees)}</dd></div>
                <div><dt className="text-xs text-ink-subtle">You would receive</dt><dd className="text-lg font-bold tabular-nums">{money(quote.netDisbursement)}</dd></div>
              </dl>
            )}
          </Card>
        )}

        <FormErrorSummary message={error?.message} details={error?.details} visibleFields={['amount', 'termMonths', 'purpose', 'businessId']} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <ButtonLink to="/client" variant="ghost">Cancel</ButtonLink>
          <Button type="submit" loading={pending} disabled={!product || amount === '' || !purpose || (product.borrowerType === 'business' && !businessId)}>
            Save and continue to documents
          </Button>
        </div>
      </form>
    </>
  );
}
