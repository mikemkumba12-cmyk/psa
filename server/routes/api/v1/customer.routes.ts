import { Router } from 'express';
import { customerRepository } from '../../../repositories/customerRepository';
import { creditAssessmentService } from '../../../services/creditAssessmentService';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const customers = await customerRepository.findAll();
    res.json({ success: true, customers });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch customers' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await customerRepository.findById(req.params.id);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }
    res.json({ success: true, customer });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch customer' });
  }
});

router.get('/:id/intelligence', async (req, res) => {
  try {
    const customerId = req.params.id;
    const customer = await customerRepository.findById(customerId);
    if (!customer) {
      res.status(404).json({ success: false, error: 'Customer not found' });
      return;
    }

    const relationshipScore = await creditAssessmentService.getCustomerRelationshipScore(customerId);
    const timeline = await creditAssessmentService.getCustomerRiskTimeline(customerId);
    const ltv = await creditAssessmentService.getCustomerLifetimeValue(customerId, customer.name);

    res.json({
      success: true,
      customerId,
      relationshipScore,
      timeline,
      ltv,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to compute customer intelligence' });
  }
});

export default router;
