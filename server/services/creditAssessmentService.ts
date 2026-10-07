import { customerRepository } from '../repositories/customerRepository';
import { loanRepository } from '../repositories/loanRepository';
import { payrollRepository } from '../repositories/payrollRepository';
import {
  computeCustomerRelationshipScore,
  computeRepeatBorrowerOpportunities,
  computeCustomerRiskTimeline,
  computeCustomerLifetimeValue,
} from '../../src/lib/intelligenceEngine';
import type { CustomerRiskScore, CustomerRecommendation, CustomerLifetimeValue } from '../../src/types';

export const creditAssessmentService = {
  async getCustomerRelationshipScore(customerId: string): Promise<CustomerRiskScore> {
    if (!customerId) throw new Error('Customer ID is required');

    const apps = await loanRepository.findAllApplications();
    const reps = await loanRepository.findAllRepayments();
    const payrolls = await payrollRepository.findAllRecords();

    const custApps = apps.filter(a => a.userId === customerId || a.id === customerId);
    const custReps = reps.filter(r => custApps.some(a => a.id === r.applicationId));

    return computeCustomerRelationshipScore(customerId, custApps, custReps, payrolls);
  },

  async getRepeatBorrowerTopUpOpportunities(): Promise<CustomerRecommendation[]> {
    const customers = await customerRepository.findAll();
    const apps = await loanRepository.findAllApplications();
    const reps = await loanRepository.findAllRepayments();
    const payrolls = await payrollRepository.findAllRecords();

    return computeRepeatBorrowerOpportunities(customers, apps, reps, payrolls);
  },

  async getCustomerRiskTimeline(customerId: string) {
    if (!customerId) throw new Error('Customer ID is required');

    const apps = await loanRepository.findAllApplications();
    const reps = await loanRepository.findAllRepayments();

    return computeCustomerRiskTimeline(customerId, apps, reps, []);
  },

  async getCustomerLifetimeValue(customerId: string, customerName: string): Promise<CustomerLifetimeValue> {
    if (!customerId) throw new Error('Customer ID is required');

    const apps = await loanRepository.findAllApplications();
    const reps = await loanRepository.findAllRepayments();

    const custApps = apps.filter(a => a.userId === customerId || a.id === customerId || a.applicantName.toLowerCase() === customerName.toLowerCase());
    const custReps = reps.filter(r => custApps.some(a => a.id === r.applicationId));

    return computeCustomerLifetimeValue(customerId, customerName, custApps, custReps);
  },
};
