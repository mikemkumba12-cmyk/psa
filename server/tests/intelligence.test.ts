import { employerRiskService } from '../services/employerRiskService';
import { scenarioGeneratorService } from '../services/scenarioGeneratorService';
import { aiGovernanceService } from '../services/aiGovernanceService';

/**
 * Intelligence Service Tests
 * Tests employer risk prediction, scenario management, and AI governance.
 */
export async function runIntelligenceTests(): Promise<boolean> {
  console.log('[Test] Running Intelligence Tests...');
  let passed = true;

  // ── Employer Risk Service ────────────────────────────────────────

  // Test 1: Input validation - getEmployerRiskPrediction with empty employer name
  try {
    await employerRiskService.getEmployerRiskPrediction('');
    console.error('❌ Intelligence Test Failed: Empty employer name should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Employer name is required') {
      console.log('  ✓ Employer Risk Input Validation: PASSED');
    } else {
      console.error(`❌ Intelligence Test Failed: Unexpected error: ${err.message}`);
      passed = false;
    }
  }

  // Test 2: Successful employer risk prediction
  try {
    const prediction = await employerRiskService.getEmployerRiskPrediction('Ministry of Health');
    if (prediction && prediction.predictedRisk && typeof prediction.currentCollectionRate === 'number') {
      console.log(`  ✓ Employer Risk Prediction: PASSED (predictedRisk=${prediction.predictedRisk}, collectionRate=${prediction.currentCollectionRate})`);
    } else {
      console.error('❌ Intelligence Test Failed: Invalid prediction object');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: Prediction error: ${err.message}`);
    passed = false;
  }

  // Test 3: GetAllEmployerPredictions returns array
  try {
    const allPredictions = await employerRiskService.getAllEmployerPredictions();
    if (Array.isArray(allPredictions) && allPredictions.length > 0) {
      console.log(`  ✓ All Employer Predictions: PASSED (${allPredictions.length} predictions)`);
    } else {
      console.error('❌ Intelligence Test Failed: Expected non-empty array of predictions');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: All predictions error: ${err.message}`);
    passed = false;
  }

  // ── Scenario Generator Service ────────────────────────────────────

  // Test 4: Default scenario is 'Healthy Portfolio'
  const defaultScenario = scenarioGeneratorService.getActiveScenario();
  if (defaultScenario.activeScenario === 'Healthy Portfolio' && defaultScenario.portfolioHealthPct === 96.5) {
    console.log('  ✓ Default Scenario: PASSED');
  } else {
    console.error('❌ Intelligence Test Failed: Default scenario state mismatch');
    passed = false;
  }

  // Test 5: Switch to 'High Default Risk' scenario
  const highRisk = scenarioGeneratorService.switchScenario('High Default Risk');
  if (highRisk.activeScenario === 'High Default Risk' && highRisk.portfolioHealthPct === 72.0) {
    console.log('  ✓ Switch to High Default Risk Scenario: PASSED');
  } else {
    console.error('❌ Intelligence Test Failed: High Default Risk state mismatch');
    passed = false;
  }

  // Test 6: Switch to 'Payroll Crisis' scenario
  const payroll = scenarioGeneratorService.switchScenario('Payroll Crisis');
  if (payroll.activeScenario === 'Payroll Crisis' && payroll.collectionRatePct === 68.0) {
    console.log('  ✓ Switch to Payroll Crisis Scenario: PASSED');
  } else {
    console.error('❌ Intelligence Test Failed: Payroll Crisis state mismatch');
    passed = false;
  }

  // Test 7: Reset to default scenario
  const reset = scenarioGeneratorService.resetScenario();
  if (reset.activeScenario === 'Healthy Portfolio') {
    console.log('  ✓ Reset Scenario: PASSED');
  } else {
    console.error('❌ Intelligence Test Failed: Reset did not return to Healthy Portfolio');
    passed = false;
  }

  // ── AI Governance Service ─────────────────────────────────────────

  // Test 8: Input validation - recordOfficerOverride with missing applicationId
  try {
    await aiGovernanceService.recordOfficerOverride({
      applicationId: '',
      aiRecommendation: 'Approve',
      aiConfidence: 85,
      aiSignals: ['good_history'],
      officerId: 'off-001',
      officerDecision: 'Approve',
    });
    console.error('❌ Intelligence Test Failed: Empty applicationId should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Application ID is required') {
      console.log('  ✓ Governance Input Validation (empty appId): PASSED');
    } else {
      console.error(`❌ Intelligence Test Failed: Unexpected error: ${err.message}`);
      passed = false;
    }
  }

  // Test 9: Input validation - recordOfficerOverride with missing officerDecision
  try {
    await aiGovernanceService.recordOfficerOverride({
      applicationId: 'app-001',
      aiRecommendation: 'Approve',
      aiConfidence: 85,
      aiSignals: ['good_history'],
      officerId: 'off-001',
      officerDecision: '',
    });
    console.error('❌ Intelligence Test Failed: Empty officerDecision should throw');
    passed = false;
  } catch (err: any) {
    if (err.message === 'Officer decision is required') {
      console.log('  ✓ Governance Input Validation (empty decision): PASSED');
    } else {
      console.error(`❌ Intelligence Test Failed: Unexpected error: ${err.message}`);
      passed = false;
    }
  }

  // Test 10: Record AI recommendation override (officer disagrees)
  try {
    const overrideEntry = await aiGovernanceService.recordOfficerOverride({
      applicationId: 'app-override-001',
      aiRecommendation: 'Approve',
      aiConfidence: 78,
      aiSignals: ['medium_history', 'stable_income'],
      officerId: 'off-001',
      officerDecision: 'Decline',
      overrideReason: 'Applicant has inconsistent repayment history on manual check',
    });
    if (overrideEntry.isOverride && overrideEntry.aiRecommendation === 'Approve' && overrideEntry.officerDecision === 'Decline') {
      console.log('  ✓ AI Recommendation Override Recording: PASSED');
    } else {
      console.error('❌ Intelligence Test Failed: Override entry fields mismatch');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: Override error: ${err.message}`);
    passed = false;
  }

  // Test 11: Record AI recommendation acceptance (officer agrees)
  try {
    const acceptEntry = await aiGovernanceService.recordOfficerOverride({
      applicationId: 'app-accept-001',
      aiRecommendation: 'Approve',
      aiConfidence: 92,
      aiSignals: ['excellent_history', 'low_dti'],
      officerId: 'off-001',
      officerDecision: 'Approve',
    });
    if (!acceptEntry.isOverride && acceptEntry.officerDecision === acceptEntry.aiRecommendation) {
      console.log('  ✓ AI Recommendation Acceptance Recording: PASSED');
    } else {
      console.error('❌ Intelligence Test Failed: Acceptance entry fields mismatch');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: Acceptance error: ${err.message}`);
    passed = false;
  }

  // Test 12: Get decision history for a specific application
  try {
    const history = await aiGovernanceService.getDecisionHistory('app-override-001');
    if (Array.isArray(history) && history.length > 0) {
      console.log(`  ✓ Decision History by Application: PASSED (${history.length} entries)`);
    } else {
      console.error('❌ Intelligence Test Failed: Expected non-empty history array');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: Decision history error: ${err.message}`);
    passed = false;
  }

  // Test 13: Get all decision history
  try {
    const allHistory = await aiGovernanceService.getDecisionHistory();
    if (Array.isArray(allHistory) && allHistory.length >= 2) {
      console.log(`  ✓ All Decision History Retrieval: PASSED (${allHistory.length} entries)`);
    } else {
      console.error('❌ Intelligence Test Failed: Expected at least 2 history entries');
      passed = false;
    }
  } catch (err: any) {
    console.error(`❌ Intelligence Test Failed: All history error: ${err.message}`);
    passed = false;
  }

  return passed;
}