import { Router } from 'express';
import { payrollRepository } from '../../../repositories/payrollRepository';
import { employerRiskService } from '../../../services/employerRiskService';

const router = Router();

router.get('/batches', async (_req, res) => {
  try {
    const batches = await payrollRepository.findAllBatches();
    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch payroll batches' });
  }
});

router.get('/exceptions', async (_req, res) => {
  try {
    const records = await payrollRepository.findAllRecords();
    const exceptions = records.filter(r => r.status === 'Unmatched' || r.status === 'Failed');
    res.json({ success: true, exceptions });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch payroll exceptions' });
  }
});

router.get('/employer/:name/performance', async (req, res) => {
  try {
    const prediction = await employerRiskService.getEmployerRiskPrediction(req.params.name);
    res.json({ success: true, prediction });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch employer performance' });
  }
});

export default router;

