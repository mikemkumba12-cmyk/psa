import { creditAssessmentService } from '../services/creditAssessmentService';

/**
 * Credit Assessment Service Tests
 * Tests input validation, error handling, and data flow for the
 * credit assessment service layer.
 */
export async function runCreditAssessmentTests(): Promise<boolean> {
  console.log('[Test] Running Credit Assessment Tests...');
  let passed = true;

  // Test 1: Input validation - getCustomerRelationshipScore with empty customerId
  try {
    await creditAssessmentService.getCustomerRelationshipScore('');
    console.error('❌ CreditAssessment Test Failed: Empty customerId should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Customer ID is required') {
      console.log('  ✓ Input Validation (empty customerId): PASSED');
    } else {
      console.error(`❌ CreditAssessment Test Failed: Unexpected error message: ${err.message}`);
      passed = false;
    }
  }

  // Test 2: Input validation - getCustomerRiskTimeline with empty customerId
  try {
    await creditAssessmentService.getCustomerRiskTimeline('');
    console.error('❌ CreditAssessment Test Failed: Empty customerId for risk timeline should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Customer ID is required') {
      console.log('  ✓ Input Validation (empty customerId for risk timeline): PASSED');
    } else {
      console.error(`❌ CreditAssessment Test Failed: Unexpected error message: ${err.message}`);
      passed = false;
    }
  }

  // Test 3: Input validation - getCustomerLifetimeValue with empty customerId
  try {
    await creditAssessmentService.getCustomerLifetimeValue('', 'Test Customer');
    console.error('❌ CreditAssessment Test Failed: Empty customerId for CLV should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Customer ID is required') {
      console.log('  ✓ Input Validation (empty customerId for CLV): PASSED');
    } else {
      console.error(`❌ CreditAssessment Test Failed: Unexpected error message: ${err.message}`);
      passed = false;
    }
  }

  // Test 4: Successful data retrieval - getCustomerRelationshipScore with valid customerId
  try {
    const score = await creditAssessmentService.getCustomerRelationshipScore('cust-001');
    if (score && typeof score.score === 'number') {
      console.log(`  ✓ Customer Relationship Score Retrieval: PASSED (score=${score.score})`);
    } else {
      console.error('❌ CreditAssessment Test Failed: Invalid score object returned');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ CreditAssessment Test Failed: Relationship score retrieval error: ${err.message}`);
    passed = false;
  }

  // Test 5: Successful data retrieval - getRepeatBorrowerTopUpOpportunities
  try {
    const opportunities = await creditAssessmentService.getRepeatBorrowerTopUpOpportunities();
    if (Array.isArray(opportunities)) {
      console.log(`  ✓ Repeat Borrower Opportunities Retrieval: PASSED (${opportunities.length} opportunities)`);
    } else {
      console.error('❌ CreditAssessment Test Failed: Expected array of opportunities');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ CreditAssessment Test Failed: Opportunities retrieval error: ${err.message}`);
    passed = false;
  }

  // Test 6: Successful data retrieval - getCustomerRiskTimeline with valid customerId
  try {
    const timeline = await creditAssessmentService.getCustomerRiskTimeline('cust-001');
    if (Array.isArray(timeline)) {
      console.log(`  ✓ Customer Risk Timeline Retrieval: PASSED (${timeline.length} entries)`);
    } else {
      console.error('❌ CreditAssessment Test Failed: Expected array for risk timeline');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ CreditAssessment Test Failed: Risk timeline retrieval error: ${err.message}`);
    passed = false;
  }

  // Test 7: Successful data retrieval - getCustomerLifetimeValue with valid data
  try {
    const clv = await creditAssessmentService.getCustomerLifetimeValue('cust-001', 'Emily Gondwe');
    if (clv && typeof clv.totalBorrowed === 'number') {
      console.log(`  ✓ Customer Lifetime Value Retrieval: PASSED (totalBorrowed=${clv.totalBorrowed})`);
    } else {
      console.error('❌ CreditAssessment Test Failed: Invalid CLV object returned');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ CreditAssessment Test Failed: CLV retrieval error: ${err.message}`);
    passed = false;
  }

  return passed;
}