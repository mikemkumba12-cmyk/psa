import { signJwt, verifyJwt } from '../middleware/auth';

export async function runAuthTests(): Promise<boolean> {
  console.log('[Test] Running Auth Tests...');
  let passed = true;

  // Test 1: Sign and Verify JWT
  const user = { id: 'u1', email: 'test@pinaco.mw', name: 'Test User', role: 'officer' as const };
  const token = signJwt(user, 300);
  const verified = verifyJwt(token);

  if (!verified || verified.id !== 'u1' || verified.role !== 'officer') {
    console.error('❌ Auth Test Failed: JWT signing/verification mismatch');
    passed = false;
  } else {
    console.log('  ✓ JWT Signing & Verification: PASSED');
  }

  // Test 2: Invalid JWT signature
  const tamperedToken = token.slice(0, -4) + 'abcd';
  const tamperedResult = verifyJwt(tamperedToken);
  if (tamperedResult !== null) {
    console.error('❌ Auth Test Failed: Tampered token accepted');
    passed = false;
  } else {
    console.log('  ✓ Tampered Token Signature Rejection: PASSED');
  }

  return passed;
}
