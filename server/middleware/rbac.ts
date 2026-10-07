import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth';

export type UserRole = 'admin' | 'executive' | 'manager' | 'officer' | 'customer';

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const userRole = req.user.role.toLowerCase() as UserRole;
    if (allowedRoles.includes('admin') && userRole === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        error: `Forbidden: Role '${req.user.role}' lacks permission for this endpoint`,
      });
      return;
    }

    next();
  };
}
