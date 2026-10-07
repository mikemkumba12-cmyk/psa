import { requireRole } from '../middleware/rbac';
import type { AuthenticatedRequest } from '../middleware/auth';

export async function runRbacTests(): Promise<boolean> {
  console.log('[Test] Running RBAC Tests...');
  let passed = true;

  // Test 1: Manager accessing manager endpoint
  const req1 = { user: { id: 'm1', email: 'mgr@pinaco.mw', name: 'Mgr', role: 'manager' } } as AuthenticatedRequest;
  let allowed = false;
  const middleware1 = requireRole(['manager', 'admin']);

  middleware1(req1, {} as any, () => { allowed = true; });
  if (!allowed) {
    console.error('❌ RBAC Test Failed: Manager denied manager route access');
    passed = false;
  } else {
    console.log('  ✓ Manager Role Access: PASSED');
  }

  // Test 2: Customer accessing manager endpoint
  const req2 = { user: { id: 'c1', email: 'cust@pinaco.mw', name: 'Cust', role: 'customer' } } as AuthenticatedRequest;
  let denied = false;
  const res2 = {
    status: (code: number) => {
      if (code === 403) denied = true;
      return { json: () => {} };
    },
  } as any;

  middleware1(req2, res2, () => {});
  if (!denied) {
    console.error('❌ RBAC Test Failed: Customer granted manager route access');
    passed = false;
  } else {
    console.log('  ✓ Customer Access Rejection (403 Forbidden): PASSED');
  }

  return passed;
}
