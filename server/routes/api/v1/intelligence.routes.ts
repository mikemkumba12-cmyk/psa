import { Router } from 'express';
import { creditAssessmentService } from '../../../services/creditAssessmentService';
import { employerRiskService } from '../../../services/employerRiskService';

const router = Router();

router.get('/top-up-opportunities', async (_req, res) => {
  try {
    const opportunities = await creditAssessmentService.getRepeatBorrowerTopUpOpportunities();
    res.json({ success: true, opportunities });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to compute top-up opportunities' });
  }
});

router.get('/employer-predictions', async (_req, res) => {
  try {
    const predictions = await employerRiskService.getAllEmployerPredictions();
    res.json({ success: true, predictions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to compute employer predictions' });
  }
});

export default router;
