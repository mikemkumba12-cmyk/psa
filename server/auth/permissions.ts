import type { NextFunction, Request, Response } from 'express';
import { many, type Queryable, pool } from '../db/pool';
import { forbidden, unauthorized } from '../lib/http';
import { recordAudit } from '../lib/audit';

export const PERMISSIONS = [
  'customers.view', 'customers.manage',
  'members.view', 'members.manage',
  'businesses.view', 'businesses.manage', 'businesses.verify',
  'documents.view', 'documents.verify', 'documents.delete',
  'applications.view_all', 'applications.all_products', 'applications.assign', 'applications.assess',
  'applications.recommend', 'applications.request_info', 'applications.approve', 'applications.reject',
  'offers.prepare',
  'disbursements.record', 'disbursements.confirm', 'repayments.record', 'repayments.confirm',
  'payroll.manage',
  'reports.view', 'reports.export', 'reports.sme',
  'products.manage', 'staff.manage', 'permissions.manage', 'settings.manage', 'audit.view', 'knowledge.manage',
] as const;

export type Permission = typeof PERMISSIONS[number];

export const STAFF_ROLES = ['loan_officer', 'manager', 'executive', 'admin'] as const;
export type Role = 'customer' | typeof STAFF_ROLES[number];

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

/** Effective permissions = role defaults + individual grants − individual denials. Administrators hold all. */
export async function loadEffectivePermissions(userId: string, role: string, client: Queryable = pool): Promise<Set<Permission>> {
  if (role === 'customer') return new Set();
  if (role === 'admin') return new Set(PERMISSIONS);
  const rows = await many<{ permission_id: Permission }>(
    `SELECT permission_id FROM role_permissions WHERE role_id = $2
     UNION
     SELECT permission_id FROM user_permissions WHERE user_id = $1 AND effect = 'grant'
     EXCEPT
     SELECT permission_id FROM user_permissions WHERE user_id = $1 AND effect = 'deny'`,
    [userId, role],
    client,
  );
  return new Set(rows.map(row => row.permission_id));
}

/** Products a staff member may work on, or 'all'. */
export async function loadProductAccess(req: Request): Promise<Set<string> | 'all'> {
  const auth = req.auth;
  if (!auth) throw unauthorized();
  if (auth.productAccessCache) return auth.productAccessCache;
  let access: Set<string> | 'all';
  if (auth.permissions.has('applications.all_products')) {
    access = 'all';
  } else {
    const rows = await many<{ product_id: string }>('SELECT product_id FROM user_product_access WHERE user_id = $1', [auth.userId]);
    access = new Set(rows.map(row => row.product_id));
  }
  auth.productAccessCache = access;
  return access;
}

export function hasPermission(req: Request, permission: Permission): boolean {
  return Boolean(req.auth?.permissions.has(permission));
}

export function assertPermission(req: Request, permission: Permission): void {
  if (!req.auth) throw unauthorized();
  if (!req.auth.permissions.has(permission)) {
    void recordAudit({
      actor: { id: req.auth.userId, name: req.auth.fullName, role: req.auth.role },
      action: 'authorization.denied',
      entityType: 'permission',
      entityId: permission,
      outcome: 'denied',
      summary: `${req.method} ${req.originalUrl} denied: missing ${permission}.`,
    }).catch(() => undefined);
    throw forbidden(`You need the "${permission}" permission to do this.`);
  }
}

/** Route guard: the user must hold every listed permission. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      for (const permission of permissions) assertPermission(req, permission);
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireStaff(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isStaff) return next(forbidden('This area is for staff only.'));
  next();
}

export function requireCustomer(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role !== 'customer' || !req.auth.customerId) return next(forbidden('This area is for customers only.'));
  next();
}
