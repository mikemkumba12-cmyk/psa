import { Router } from 'express';
import { loanRepository } from '../../../repositories/loanRepository';
import { runExpertSystem } from '../../../../src/lib/intelligenceEngine';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const loans = await loanRepository.findAllApplications();
    res.json({ success: true, loans });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch loans' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const loan = await loanRepository.findApplicationById(req.params.id);
    if (!loan) {
      res.status(404).json({ success: false, error: 'Loan application not found' });
      return;
    }
    res.json({ success: true, loan });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch loan' });
  }
});

router.get('/:id/recommendation', async (req, res) => {
  try {
    const loan = await loanRepository.findApplicationById(req.params.id);
    if (!loan) {
      res.status(404).json({ success: false, error: 'Loan application not found' });
      return;
    }

    const rec = runExpertSystem(loan);
    res.json({
      success: true,
      applicationId: loan.id,
      aiRecommendation: rec.verdict === 'Approve' ? 'Approve' : rec.verdict === 'Decline' ? 'Decline' : 'Review',
      riskLevel: rec.healthScore?.tier ?? 'Medium',
      score: rec.healthScore?.composite ?? rec.confidence,
      signals: rec.rulesFired?.map((r: { name: string }) => r.name) ?? [],
      confidence: rec.confidence,
      verdict: rec.verdict,
      primaryReason: rec.primaryReason,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to compute credit recommendation' });
  }
});

export default router;

