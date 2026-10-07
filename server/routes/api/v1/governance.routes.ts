import { Router } from 'express';
import { aiGovernanceService } from '../../../services/aiGovernanceService';
import { scenarioGeneratorService, type DemoScenario } from '../../../services/scenarioGeneratorService';
import { requireRole } from '../../../middleware/rbac';

const router = Router();

router.post('/override', requireRole(['officer', 'manager', 'admin']), async (req, res) => {
  try {
    const entry = await aiGovernanceService.recordOfficerOverride(req.body);
    res.json({ success: true, entry });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Failed to record override';
    res.status(400).json({ success: false, error: errMsg });
  }
});

router.get('/history', async (req, res) => {
  try {
    const appId = req.query.applicationId as string | undefined;
    const history = await aiGovernanceService.getDecisionHistory(appId);
    res.json({ success: true, history });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch decision history' });
  }
});

// Scenario Switcher Endpoints
router.get('/scenarios/active', (_req, res) => {
  res.json({ success: true, scenario: scenarioGeneratorService.getActiveScenario() });
});

router.post('/scenarios/switch', (req, res) => {
  const { scenario } = req.body as { scenario: DemoScenario };
  if (!['Healthy Portfolio', 'High Default Risk', 'Payroll Crisis'].includes(scenario)) {
    res.status(400).json({ success: false, error: 'Invalid scenario type' });
    return;
  }
  const updated = scenarioGeneratorService.switchScenario(scenario);
  res.json({ success: true, scenario: updated });
});

export default router;
