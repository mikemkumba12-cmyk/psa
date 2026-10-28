import React, { useMemo, useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { api, ApiError } from '../../api/client';
import type { Product, StaffMember } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { dateTime, money, relative, ROLE_LABELS } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, ErrorState, LoadingBlock } from '../../ui/Feedback';
import { DataTable } from '../../ui/DataTable';
import { Checkbox, FormErrorSummary, FormGrid, MoneyInput, Select, TextInput } from '../../ui/Form';
import { Card, PageHeader } from '../../ui/Layout';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

interface Catalogue { permissions: Array<{ id: string; name: string; group: string; description: string }>; roles: string[]; roleDefaults: Record<string, string[]> }

export function StaffAdmin() {
  const { can, profile } = useAuth();
  const { data, error, loading, reload } = useResource<StaffMember[]>('/api/admin/staff');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<StaffMember | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  return (
    <>
      <PageHeader title="Staff and permissions" description="Changes take effect on the staff member’s next request — no sign-out or rebuild needed. Every change is audited."
        actions={can('staff.manage') && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>Add staff member</Button>} />
      <Card padded={false}>
        <DataTable caption="Staff" rows={data} loading={loading} error={error} onRetry={reload} rowKey={row => row.id} onRowClick={row => setSelected(row)}
          empty={{ title: 'No staff accounts' }}
          columns={[
            { key: 'name', header: 'Name', mobile: 'title', render: row => <>{row.fullName}{row.id === profile?.id && ' (you)'}<span className="block text-xs text-ink-muted">{row.email}</span></> },
            { key: 'role', header: 'Role', render: row => <>{ROLE_LABELS[row.role]}{row.staffTitle && <span className="block text-xs text-ink-muted">{row.staffTitle}</span>}</> },
            { key: 'limit', header: 'Approval limit', align: 'right', render: row => row.approvalLimit !== null ? money(row.approvalLimit, { compact: true }) : row.role === 'admin' ? 'Unlimited' : 'None' },
            { key: 'overrides', header: 'Overrides', render: row => `${row.grants.length} granted · ${row.denies.length} removed` },
            { key: 'status', header: 'Status', render: row => !row.isActive ? <Badge tone="neutral">Deactivated</Badge> : row.mustChangePassword ? <Badge tone="warning">Temp password</Badge> : <Badge tone="success">Active</Badge> },
            { key: 'login', header: 'Last sign-in', render: row => row.lastLoginAt ? relative(row.lastLoginAt) : 'Never' },
          ]} />
      </Card>
      {creating && <CreateStaffModal onClose={() => setCreating(false)} onCreated={(name, password) => { setCreating(false); setTempPassword({ name, password }); void reload(); }} />}
      {selected && <AccessEditor staff={selected} onClose={() => setSelected(null)} onChanged={() => { void reload(); }} onTempPassword={(name, password) => setTempPassword({ name, password })} />}
      <Modal open={Boolean(tempPassword)} onClose={() => setTempPassword(null)} title="Temporary password" size="sm"
        footer={<Button onClick={() => setTempPassword(null)}>Done</Button>}>
        <p className="text-sm text-ink-muted">Give this to {tempPassword?.name} in person or by phone. It is shown only once and must be changed at first sign-in.</p>
        <p className="mt-3 select-all break-all rounded-lg bg-surface-muted p-3 text-center font-mono text-lg font-semibold">{tempPassword?.password}</p>
      </Modal>
    </>
  );
}

function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string, password: string) => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'loan_officer', staffTitle: '' });
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    setError(null);
    try {
      const result = await api<{ temporaryPassword: string }>('/api/admin/staff', { body: { ...form, phone: form.phone || undefined, staffTitle: form.staffTitle || undefined } });
      onCreated(form.fullName, result.temporaryPassword);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not create the account.'));
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal open onClose={onClose} title="Add staff member" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={pending}>Create account</Button></>}>
      <div className="space-y-4">
        <FormErrorSummary message={error?.message} details={error?.details} />
        <FormGrid>
          <TextInput label="Full name" required value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} />
          <TextInput label="Work email" type="email" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
          <TextInput label="Phone" type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
          <TextInput label="Job title" value={form.staffTitle} onChange={event => setForm({ ...form, staffTitle: event.target.value })} />
          <Select label="Role" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}
            options={['loan_officer', 'manager', 'executive', ...(profile?.role === 'admin' ? ['admin'] : [])].map(value => ({ value, label: ROLE_LABELS[value] }))}
            hint="The role sets default permissions. Adjust individual access after creating the account." />
        </FormGrid>
      </div>
    </Modal>
  );
}

function AccessEditor({ staff, onClose, onChanged, onTempPassword }: { staff: StaffMember; onClose: () => void; onChanged: () => void; onTempPassword: (name: string, password: string) => void }) {
  const { profile, can } = useAuth();
  const toast = useToast();
  const catalogue = useResource<Catalogue>('/api/admin/permissions');
  const products = useResource<Product[]>('/api/products');
  const access = useResource<StaffMember>(can('permissions.manage') ? `/api/admin/staff/${staff.id}/access` : null);
  const [grants, setGrants] = useState<string[] | null>(null);
  const [denies, setDenies] = useState<string[] | null>(null);
  const [productIds, setProductIds] = useState<string[] | null>(null);
  const [limit, setLimit] = useState<number | '' | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | 'reset' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [pending, setPending] = useState(false);
  const self = staff.id === profile?.id;

  const current = access.data;
  const effGrants = grants ?? current?.grants ?? [];
  const effDenies = denies ?? current?.denies ?? [];
  const effProducts = productIds ?? current?.productIds ?? [];
  const effLimit = limit ?? current?.approvalLimit ?? '';
  const effRole = role ?? staff.role;
  const defaults = useMemo(() => new Set(catalogue.data?.roleDefaults[effRole] ?? []), [catalogue.data, effRole]);

  const isOn = (permission: string) => effRole === 'admin' || ((defaults.has(permission) || effGrants.includes(permission)) && !effDenies.includes(permission));
  const toggle = (permission: string, on: boolean) => {
    const fromRole = defaults.has(permission);
    setGrants((on && !fromRole ? [...effGrants, permission] : effGrants.filter(item => item !== permission)).filter((item, index, list) => list.indexOf(item) === index));
    setDenies((!on && fromRole ? [...effDenies, permission] : effDenies.filter(item => item !== permission)).filter((item, index, list) => list.indexOf(item) === index));
  };

  const groups = useMemo(() => {
    const map = new Map<string, Catalogue['permissions']>();
    for (const permission of catalogue.data?.permissions ?? []) map.set(permission.group, [...(map.get(permission.group) ?? []), permission]);
    return [...map.entries()];
  }, [catalogue.data]);

  const save = async () => {
    setPending(true);
    setError(null);
    try {
      if (role && role !== staff.role) await api(`/api/admin/staff/${staff.id}`, { method: 'PATCH', body: { role } });
      await api(`/api/admin/staff/${staff.id}/access`, { method: 'PUT', body: { grants: effGrants, denies: effDenies, productIds: effProducts, approvalLimit: effLimit === '' ? null : effLimit } });
      toast('Access updated. It applies immediately.');
      onChanged();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new ApiError(0, 'Could not save.'));
    } finally {
      setPending(false);
    }
  };

  const lifecycle = async () => {
    setPending(true);
    try {
      if (confirm === 'reset') {
        const result = await api<{ temporaryPassword: string }>(`/api/admin/staff/${staff.id}/reset-password`, { method: 'POST' });
        onTempPassword(staff.fullName, result.temporaryPassword);
      } else {
        await api(`/api/admin/staff/${staff.id}`, { method: 'PATCH', body: { isActive: confirm === 'reactivate' } });
        toast(confirm === 'deactivate' ? 'Account deactivated and signed out everywhere.' : 'Account reactivated.');
      }
      onChanged();
      onClose();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not update the account.', 'error');
    } finally {
      setPending(false);
      setConfirm(null);
    }
  };

  const canEditAccess = can('permissions.manage') && !self;
  return (
    <Modal open onClose={onClose} size="xl" title={staff.fullName} description={`${ROLE_LABELS[staff.role]} · ${staff.email} · created ${dateTime(staff.createdAt)}`}
      footer={<>
        {can('staff.manage') && !self && <Button variant="ghost" icon={<KeyRound className="h-4 w-4" />} onClick={() => setConfirm('reset')}>Reset password</Button>}
        {can('staff.manage') && !self && <Button variant={staff.isActive ? 'danger' : 'secondary'} onClick={() => setConfirm(staff.isActive ? 'deactivate' : 'reactivate')}>{staff.isActive ? 'Deactivate' : 'Reactivate'}</Button>}
        {canEditAccess && <Button onClick={save} loading={pending}>Save access</Button>}
      </>}>
      {self && <Alert tone="info">You can’t change your own access. Ask another administrator.</Alert>}
      {!can('permissions.manage') && <Alert tone="info">You need the “Manage permissions” permission to change access.</Alert>}
      {access.error && <ErrorState error={access.error} />}
      {canEditAccess && (!current || !catalogue.data) && !access.error && <LoadingBlock />}
      {canEditAccess && current && catalogue.data && (
        <div className="space-y-6">
          <FormErrorSummary message={error?.message} details={error?.details} />
          <FormGrid columns={2}>
            <Select label="Role" value={effRole} onChange={event => setRole(event.target.value)}
              options={catalogue.data.roles.filter(item => item !== 'admin' || profile?.role === 'admin').map(value => ({ value, label: ROLE_LABELS[value] }))} />
            <MoneyInput label="Approval limit" value={effLimit} onValueChange={setLimit} hint={effRole === 'admin' ? 'Empty = unlimited for administrators.' : 'Empty = cannot approve loans.'} />
          </FormGrid>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Loan products this person may work on</h3>
            <p className="mb-3 text-xs text-ink-muted">{isOn('applications.all_products') ? 'This person currently has “All loan products”, so these assignments are not needed.' : 'Applications for other products are hidden from them.'}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(products.data ?? []).filter(product => product.status !== 'retired').map(product => (
                <Checkbox key={product.id} label={product.name} description={product.status !== 'active' ? product.status : undefined} checked={effProducts.includes(product.id)}
                  onChange={on => setProductIds(on ? [...effProducts, product.id] : effProducts.filter(item => item !== product.id))} />
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Permissions</h3>
            <p className="mb-3 text-xs text-ink-muted">Ticked = allowed. <Badge tone="info">role default</Badge> means it comes from the role; untick to remove it for this person only.</p>
            {effRole === 'admin' ? <Alert tone="info">Administrators hold every permission.</Alert> : (
              <div className="grid gap-4 md:grid-cols-2">
                {groups.map(([group, permissions]) => (
                  <fieldset key={group} className="rounded-lg border border-line p-3">
                    <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-ink-subtle">{group}</legend>
                    <div className="space-y-2.5">
                      {permissions.map(permission => (
                        <Checkbox key={permission.id} checked={isOn(permission.id)} onChange={on => toggle(permission.id, on)}
                          label={<>{permission.name} {defaults.has(permission.id) && <Badge tone="info">role default</Badge>}</>} description={permission.description} />
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
      <ConfirmDialog open={Boolean(confirm)} onClose={() => setConfirm(null)} pending={pending} onConfirm={lifecycle}
        tone={confirm === 'deactivate' ? 'danger' : 'primary'}
        title={confirm === 'reset' ? 'Issue a temporary password?' : confirm === 'deactivate' ? 'Deactivate this account?' : 'Reactivate this account?'}
        confirmLabel={confirm === 'reset' ? 'Reset password' : confirm === 'deactivate' ? 'Deactivate' : 'Reactivate'}
        message={confirm === 'reset' ? 'They will be signed out everywhere and must choose a new password at next sign-in.' : confirm === 'deactivate' ? 'They will be signed out immediately and cannot sign in until reactivated.' : undefined} />
    </Modal>
  );
}
