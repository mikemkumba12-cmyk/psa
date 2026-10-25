import './env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, quoteLoan, round2 } from '../lib/loanMath';

const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));

describe('loan calculations', () => {
  it('reducing balance: standard annuity, schedule sums exactly to principal', () => {
    // 1,000,000 at 5% per month over 12 months -> annuity 112,825.41
    const quote = quoteLoan({ principal: 1_000_000, termMonths: 12, monthlyRatePct: 5, interestMethod: 'reducing_balance', repaymentFrequency: 'monthly', startDate: '2026-01-15' });
    assert.equal(quote.installmentAmount, 112825.41);
    assert.equal(sum(quote.schedule.map(line => line.principal)), 1_000_000);
    assert.equal(quote.schedule.at(-1)!.balanceAfter, 0);
    assert.equal(quote.totalRepayable, sum(quote.schedule.map(line => line.total)));
    assert.equal(quote.schedule[0].interest, 50000);
  });

  it('flat rate: interest on original principal every month', () => {
    const quote = quoteLoan({ principal: 600_000, termMonths: 6, monthlyRatePct: 4, interestMethod: 'flat', repaymentFrequency: 'monthly', startDate: '2026-03-01' });
    assert.equal(quote.totalInterest, 144_000);
    assert.equal(quote.installmentAmount, 124_000);
    assert.ok(quote.schedule.every(line => line.interest === 24_000));
  });

  it('handles uneven division by putting rounding in the last installment', () => {
    const quote = quoteLoan({ principal: 1_000_000, termMonths: 7, monthlyRatePct: 3.3333, interestMethod: 'flat', repaymentFrequency: 'monthly', startDate: '2026-03-01' });
    assert.equal(sum(quote.schedule.map(line => line.principal)), 1_000_000);
    assert.equal(quote.totalInterest, round2(1_000_000 * 0.033333 * 7));
  });

  it('bullet repayment: one payment at maturity', () => {
    const quote = quoteLoan({ principal: 5_000_000, termMonths: 3, monthlyRatePct: 4, interestMethod: 'flat', repaymentFrequency: 'bullet', startDate: '2026-02-10' });
    assert.equal(quote.schedule.length, 1);
    assert.equal(quote.schedule[0].dueDate, '2026-05-10');
    assert.equal(quote.totalRepayable, 5_600_000);
  });

  it('zero interest rate is allowed and exact', () => {
    const quote = quoteLoan({ principal: 90_000, termMonths: 3, monthlyRatePct: 0, interestMethod: 'reducing_balance', repaymentFrequency: 'monthly', startDate: '2026-01-01' });
    assert.deepEqual(quote.schedule.map(line => line.total), [30_000, 30_000, 30_000]);
  });

  it('fees: percent and fixed, separating amounts deducted at disbursement', () => {
    const quote = quoteLoan({
      principal: 2_000_000, termMonths: 6, monthlyRatePct: 5, interestMethod: 'reducing_balance', repaymentFrequency: 'monthly', startDate: '2026-01-01',
      fees: [
        { name: 'Arrangement fee', type: 'percent', value: 2.5, deductedFromDisbursement: true },
        { name: 'Insurance', type: 'fixed', value: 15_000, deductedFromDisbursement: false },
      ],
    });
    assert.equal(quote.totalFees, 65_000);
    assert.equal(quote.netDisbursement, 1_950_000);
  });

  it('rejects invalid inputs', () => {
    assert.throws(() => quoteLoan({ principal: 0, termMonths: 6, monthlyRatePct: 5, interestMethod: 'flat', repaymentFrequency: 'monthly', startDate: '2026-01-01' }));
    assert.throws(() => quoteLoan({ principal: 1000, termMonths: 2.5, monthlyRatePct: 5, interestMethod: 'flat', repaymentFrequency: 'monthly', startDate: '2026-01-01' }));
  });

  it('month arithmetic clamps to month end', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
    assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
  });
});
