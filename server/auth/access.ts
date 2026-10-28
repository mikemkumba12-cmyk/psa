import type { Request } from 'express';
import { many, one } from '../db/pool';
import { forbidden, notFound, unauthorized } from '../lib/http';
import { loadProductAccess } from './permissions';

/**
 * Record-level access checks. Permissions say what kind of action a user may
 * take; these functions decide whether they may take it on a particular record.
 * Every route that loads a record by id must go through one of them.
 */

const MANAGING_PARTY_ROLES = ['owner', 'director', 'representative'];

export async function customerPartyRoles(customerId: string, businessId: string): Promise<string[]> {
  const rows = await many<{ role: string }>(
    'SELECT role FROM business_parties WHERE customer_id = $1 AND business_id = $2',
    [customerId, businessId],
  );
  return rows.map(row => row.role);
}

// ── Customers ────────────────────────────────────────────────────────────────

export async function assertCustomerAccess(req: Request, customerId: string): Promise<void> {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  if (auth.role === 'customer') {
    if (auth.customerId !== customerId) throw notFound('Customer not found.');
    return;
  }
  if (!auth.permissions.has('customers.view')) throw forbidden('You need the "customers.view" permission.');
}

// ── Businesses ───────────────────────────────────────────────────────────────

export async function assertBusinessAccess(req: Request, businessId: string, mode: 'view' | 'manage'): Promise<void> {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  const exists = await one('SELECT 1 FROM businesses WHERE id = $1', [businessId]);
  if (!exists) throw notFound('Business not found.');

  if (auth.role === 'customer') {
    if (!auth.customerId) throw notFound('Business not found.');
    const roles = await customerPartyRoles(auth.customerId, businessId);
    if (!roles.length) throw notFound('Business not found.');
    if (mode === 'manage' && !roles.some(role => MANAGING_PARTY_ROLES.includes(role))) {
      throw forbidden('Only owners, directors and authorised representatives can change this business.');
    }
    return;
  }
  const needed = mode === 'view' ? 'businesses.view' : 'businesses.manage';
  if (!auth.permissions.has(needed)) throw forbidden(`You need the "${needed}" permission.`);
}

// ── Applications ─────────────────────────────────────────────────────────────

export interface ApplicationAccessRow {
  id: string;
  status: string;
  customer_id: string | null;
  business_id: string | null;
  product_id: string | null;
  assigned_officer_id: string | null;
  recommended_by: string | null;
  decided_by: string | null;
  borrower_type: string | null;
  amount: number;
}

export async function loadApplicationForAccess(applicationId: string): Promise<ApplicationAccessRow | null> {
  return one<ApplicationAccessRow>(
    `SELECT id, status, customer_id, business_id, product_id, assigned_officer_id, recommended_by, decided_by,
            borrower_type, amount
       FROM loan_applications WHERE id = $1`,
    [applicationId],
  );
}

/** Whether a staff member may see an application: assigned to them, or broad access within their products. */
export async function staffCanSeeApplication(req: Request, app: ApplicationAccessRow): Promise<boolean> {
  const auth = req.auth!;
  if ([app.assigned_officer_id, app.recommended_by, app.decided_by].includes(auth.userId)) return true;
  const broad = auth.permissions.has('applications.view_all') || auth.permissions.has('applications.assign');
  if (!broad) return false;
  const products = await loadProductAccess(req);
  return products === 'all' || (app.product_id !== null && products.has(app.product_id));
}

export async function customerCanSeeApplication(req: Request, app: ApplicationAccessRow): Promise<boolean> {
  const customerId = req.auth?.customerId;
  if (!customerId) return false;
  if (app.customer_id === customerId) return true;
  if (app.business_id) {
    const roles = await customerPartyRoles(customerId, app.business_id);
    return roles.some(role => MANAGING_PARTY_ROLES.includes(role));
  }
  return false;
}

export async function assertApplicationAccess(req: Request, applicationId: string): Promise<ApplicationAccessRow> {
  if (!req.auth) throw unauthorized();
  const app = await loadApplicationForAccess(applicationId);
  // Unauthorised users get 404 rather than 403 so ids cannot be probed.
  if (!app) throw notFound('Application not found.');
  const allowed = req.auth.role === 'customer'
    ? await customerCanSeeApplication(req, app)
    : await staffCanSeeApplication(req, app);
  if (!allowed) throw notFound('Application not found.');
  return app;
}

/** SQL fragment + params restricting an application list to what a staff member may see. */
export async function staffApplicationScope(req: Request, alias = 'a', startIndex = 1): Promise<{ sql: string; params: unknown[] }> {
  const auth = req.auth!;
  const mine = `(${alias}.assigned_officer_id = $${startIndex} OR ${alias}.recommended_by = $${startIndex} OR ${alias}.decided_by = $${startIndex})`;
  const broad = auth.permissions.has('applications.view_all') || auth.permissions.has('applications.assign');
  if (!broad) return { sql: mine, params: [auth.userId] };
  const products = await loadProductAccess(req);
  if (products === 'all') return { sql: 'TRUE', params: [] };
  return {
    sql: `(${mine} OR ${alias}.product_id = ANY($${startIndex + 1}::text[]))`,
    params: [auth.userId, [...products]],
  };
}
