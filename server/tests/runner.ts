import { runAuthTests } from './auth.test';
import { runCreditAssessmentTests } from './creditAssessment.test';
import { runIntelligenceTests } from './intelligence.test';
import { runRbacTests } from './rbac.test';

async function main() {
  console.log('====================================================');
  console.log('  PINACO Smart Advisor — Server Test Suite Runner   ');
  console.log('====================================================\n');

  let allPassed = true;

  try {
    const authOk = await runAuthTests();
    if (!authOk) allPassed = false;
    console.log('');

    const creditOk = await runCreditAssessmentTests();
    if (!creditOk) allPassed = false;
    console.log('');

    const intelOk = await runIntelligenceTests();
    if (!intelOk) allPassed = false;
    console.log('');

    const rbacOk = await runRbacTests();
    if (!rbacOk) allPassed = false;
    console.log('');

  } catch (err) {
    console.error('💥 Test suite crashed with error:', err);
    allPassed = false;
  }

  console.log('====================================================');
  if (allPassed) {
    console.log('  ✅ ALL TESTS PASSED SUCCESSFULLY!                 ');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error('  ❌ SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE.  ');
    console.log('====================================================');
    process.exit(1);
  }
}

main();
