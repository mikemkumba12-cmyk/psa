/**
 * Loan calculations. All money is rounded to 2 decimal places (tambala);
 * rounding differences are absorbed by the final installment so the schedule
 * always sums exactly to principal + interest.
 *
 * Rates are MONTHLY percentages as configured on the loan product
 * (e.g. 5 means 5% per month).
 */

export type InterestMethod = 'flat' | 'reducing_balance';
export type RepaymentFrequency = 'monthly' | 'bullet';

export interface ProductFee {
  name: string;
  type: 'fixed' | 'percent';
  /** Amount in MWK for fixed fees; percentage of principal for percent fees. */
  value: number;
  /** true: deducted from the amount disbursed; false: paid separately by the borrower. */
  deductedFromDisbursement: boolean;
}

export interface ScheduleLine {
  installmentNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  balanceAfter: number;
}

export interface LoanQuote {
  principal: number;
  termMonths: number;
  monthlyRatePct: number;
  interestMethod: InterestMethod;
  repaymentFrequency: RepaymentFrequency;
  installmentAmount: number;
  totalInterest: number;
  totalRepayable: number;
  fees: Array<ProductFee & { amount: number }>;
  totalFees: number;
  netDisbursement: number;
  schedule: ScheduleLine[];
}

export const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Adds calendar months, clamping to the last day of shorter months (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(targetYear, normalizedMonth, Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

export function calculateFees(principal: number, fees: ProductFee[]): Array<ProductFee & { amount: number }> {
  return fees.map(fee => ({
    ...fee,
    amount: round2(fee.type === 'fixed' ? fee.value : principal * (fee.value / 100)),
  }));
}

export function quoteLoan(input: {
  principal: number;
  termMonths: number;
  monthlyRatePct: number;
  interestMethod: InterestMethod;
  repaymentFrequency: RepaymentFrequency;
  fees?: ProductFee[];
  startDate: string;
}): LoanQuote {
  const { principal, termMonths, monthlyRatePct, interestMethod, repaymentFrequency, startDate } = input;
  if (!(principal > 0)) throw new Error('Principal must be greater than zero.');
  if (!Number.isInteger(termMonths) || termMonths < 1) throw new Error('Term must be a whole number of months.');
  if (!(monthlyRatePct >= 0)) throw new Error('Interest rate cannot be negative.');

  const rate = monthlyRatePct / 100;
  const schedule: ScheduleLine[] = [];

  if (repaymentFrequency === 'bullet') {
    // One repayment at maturity. Interest accrues simply on the full principal for the term.
    const interest = round2(principal * rate * termMonths);
    schedule.push({
      installmentNumber: 1,
      dueDate: addMonths(startDate, termMonths),
      principal: round2(principal),
      interest,
      total: round2(principal + interest),
      balanceAfter: 0,
    });
  } else if (interestMethod === 'flat') {
    const principalPart = round2(principal / termMonths);
    const interestPart = round2(principal * rate);
    let balance = principal;
    for (let n = 1; n <= termMonths; n += 1) {
      const isLast = n === termMonths;
      const p = isLast ? round2(balance) : principalPart;
      const i = isLast ? round2(principal * rate * termMonths - interestPart * (termMonths - 1)) : interestPart;
      balance = round2(balance - p);
      schedule.push({ installmentNumber: n, dueDate: addMonths(startDate, n), principal: p, interest: i, total: round2(p + i), balanceAfter: balance });
    }
  } else {
    const payment = rate === 0 ? principal / termMonths : (principal * rate) / (1 - Math.pow(1 + rate, -termMonths));
    const installment = round2(payment);
    let balance = principal;
    for (let n = 1; n <= termMonths; n += 1) {
      const interest = round2(balance * rate);
      const isLast = n === termMonths;
      const p = isLast ? round2(balance) : round2(installment - interest);
      balance = round2(balance - p);
      schedule.push({ installmentNumber: n, dueDate: addMonths(startDate, n), principal: p, interest, total: round2(p + interest), balanceAfter: balance });
    }
  }

  const fees = calculateFees(principal, input.fees || []);
  const totalFees = round2(fees.reduce((sum, fee) => sum + fee.amount, 0));
  const deducted = round2(fees.filter(fee => fee.deductedFromDisbursement).reduce((sum, fee) => sum + fee.amount, 0));
  const totalInterest = round2(schedule.reduce((sum, line) => sum + line.interest, 0));
  return {
    principal: round2(principal),
    termMonths,
    monthlyRatePct,
    interestMethod,
    repaymentFrequency,
    installmentAmount: schedule[0].total,
    totalInterest,
    totalRepayable: round2(principal + totalInterest),
    fees,
    totalFees,
    netDisbursement: round2(principal - deducted),
    schedule,
  };
}
