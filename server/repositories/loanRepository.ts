import { getAllLoanApplications, getLoanApplicationById, upsertLoanApplication, getAllRepayments } from '../db';
import type { LoanApplication, Repayment } from '../../src/types';

export const loanRepository = {
  async findAllApplications(): Promise<LoanApplication[]> {
    return getAllLoanApplications();
  },

  async findApplicationById(id: string): Promise<LoanApplication | null> {
    return getLoanApplicationById(id);
  },

  async saveApplication(app: LoanApplication): Promise<LoanApplication> {
    await upsertLoanApplication(app);
    return app;
  },

  async findAllRepayments(): Promise<Repayment[]> {
    return getAllRepayments();
  },
};
