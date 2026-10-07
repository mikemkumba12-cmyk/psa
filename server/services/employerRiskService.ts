import { payrollRepository } from '../repositories/payrollRepository';
import { computeEmployerRiskPrediction } from '../../src/lib/intelligenceEngine';
import type { EmployerRiskPrediction } from '../../src/types';

export const employerRiskService = {
  async getEmployerRiskPrediction(employerName: string): Promise<EmployerRiskPrediction> {
    if (!employerName) throw new Error('Employer name is required');

    const records = await payrollRepository.findAllRecords();
    return computeEmployerRiskPrediction(employerName, records);
  },

  async getAllEmployerPredictions(): Promise<EmployerRiskPrediction[]> {
    const records = await payrollRepository.findAllRecords();
    const employers = Array.from(new Set(records.map(r => r.employer)));

    return employers.map(emp => computeEmployerRiskPrediction(emp, records));
  },
};
