import React, { useMemo } from 'react';
import { Sparkles, TrendingUp, ChevronRight, ShieldCheck, AlertCircle } from 'lucide-react';
import type { Customer, LoanApplication, Repayment, PayrollRecord, CustomerRecommendation } from '../types';
import { computeRepeatBorrowerOpportunities } from '../lib/intelligenceEngine';

interface TopUpOpportunitiesCardProps {
  customers: Customer[];
  applications: LoanApplication[];
  repayments: Repayment[];
  payrollRecords: PayrollRecord[];
  onSelectCustomer?: (customer: Customer) => void;
}

export default function TopUpOpportunitiesCard({
  customers,
  applications,
  repayments,
  payrollRecords,
  onSelectCustomer,
}: TopUpOpportunitiesCardProps) {
  const recommendations = useMemo(
    () => computeRepeatBorrowerOpportunities(customers, applications, repayments, payrollRecords),
    [customers, applications, repayments, payrollRecords]
  );

  const topUpOpportunities = useMemo(
    () => recommendations.filter(r => r.recommendationType === 'Top-Up'),
    [recommendations]
  );

  return (
    <section className="bg-white dark:bg-white/5 border border-gray-100 dark:border-white/10 rounded-2xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/20 dark:to-indigo-950/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-purple-600 flex items-center justify-center shadow-md shadow-purple-500/20">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Repeat Borrower & Top-up Opportunities</h2>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">
              {topUpOpportunities.length} qualified customers eligible for loan expansion
            </p>
          </div>
        </div>
        <span className="text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/40 px-2.5 py-1 rounded-full">
          DTI ≤ 40% Qualified
        </span>
      </div>

      <div className="divide-y divide-gray-50 dark:divide-white/5 max-h-[350px] overflow-y-auto">
        {topUpOpportunities.length > 0 ? (
          topUpOpportunities.map(opp => {
            const cust = customers.find(c => c.id === opp.customerId || c.name === opp.customerName);
            return (
              <div key={opp.id} className="p-4 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors flex items-center justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold text-gray-900 dark:text-white">{opp.customerName}</h3>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                      {opp.confidence}% Match Confidence
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-[10px] text-gray-500">
                    <span>Current Loan: <strong>MWK {opp.currentLoanAmount.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Remaining: <strong>MWK {opp.remainingBalance.toLocaleString()}</strong></span>
                    <span>•</span>
                    <span>Post-Top-up DTI: <strong className="text-purple-600">{opp.postTopUpDti}%</strong></span>
                  </div>

                  <div className="space-y-0.5 pt-1 text-[10px] text-green-700 dark:text-green-400">
                    {opp.reasons.map((r, i) => (
                      <p key={i} className="truncate">{r}</p>
                    ))}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <span className="text-[9px] font-bold text-gray-400 uppercase block">Recommended Top-Up</span>
                  <p className="text-base font-black text-purple-600 dark:text-purple-400">
                    MWK {opp.recommendedAmount.toLocaleString()}
                  </p>
                  {cust && onSelectCustomer && (
                    <button
                      onClick={() => onSelectCustomer(cust)}
                      className="mt-1 text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-0.5 ml-auto"
                    >
                      View 360 Profile <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8 text-gray-300" />
            No customer currently qualifies for automatic top-up loan expansion.
          </div>
        )}
      </div>
    </section>
  );
}
