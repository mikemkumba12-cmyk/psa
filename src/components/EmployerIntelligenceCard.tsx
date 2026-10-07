import React from 'react';
import { Building2, Users, CheckCircle, AlertTriangle, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import type { EmployerPerformance, PayrollRecord } from '../types';
import { computeEmployerRiskPrediction } from '../lib/intelligenceEngine';

interface EmployerIntelligenceCardProps {
  employers: EmployerPerformance[];
  payrollRecords?: PayrollRecord[];
}

function formatMWK(amount: number) {
  return 'K ' + amount.toLocaleString('en-MW');
}

export default function EmployerIntelligenceCard({ employers, payrollRecords = [] }: EmployerIntelligenceCardProps) {
  if (employers.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1a1a1a] border border-outline-variant rounded-2xl p-6 text-center text-xs text-secondary">
        No employer risk data available yet. Process payroll batches to compute employer collection trends.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <Building2 className="w-5 h-5 text-orange-500" /> Employer Risk Intelligence
          </h2>
          <p className="text-xs text-secondary">Monitors monthly payroll collection reliability across employer portfolios.</p>
        </div>
        <span className="text-xs font-bold text-orange-600 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 px-3 py-1 rounded-full">
          {employers.length} Active Employers
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {employers.map((emp) => {
          const isHighRisk = emp.riskRating === 'High';
          const isMedRisk = emp.riskRating === 'Medium';

          return (
            <div
              key={emp.employer}
              className={`bg-white dark:bg-[#1a1a1a] border rounded-2xl p-5 shadow-sm space-y-4 transition-all hover:shadow-md ${
                isHighRisk ? 'border-red-300 dark:border-red-900/40 bg-red-50/10' :
                isMedRisk ? 'border-amber-300 dark:border-amber-900/40 bg-amber-50/10' :
                'border-outline-variant'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-on-surface truncate">{emp.employer}</h3>
                  <p className="text-[10px] text-secondary flex items-center gap-1 mt-0.5">
                    <Users className="w-3 h-3 text-orange-500" />
                    <strong>{emp.employeeCount}</strong> Employee Borrowers
                  </p>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  isHighRisk ? 'bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-300' :
                  isMedRisk ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' :
                  'bg-green-100 text-green-700 dark:bg-green-950/30 dark:text-green-300'
                }`}>
                  {emp.riskRating} Risk
                </span>
              </div>

              {/* Deduction Success vs Failed Meter */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-secondary flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" /> Deductions
                  </span>
                  <span className="text-green-700 dark:text-green-400 font-bold">
                    {emp.successfulDeductionRate}% Match
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden flex">
                  <div
                    className="h-full bg-green-500"
                    style={{ width: `${emp.successfulDeductionRate}%` }}
                  />
                  <div
                    className="h-full bg-red-500"
                    style={{ width: `${emp.failedDeductionRate}%` }}
                  />
                </div>
                {emp.failedDeductionRate > 0 && (
                  <p className="text-[10px] text-red-600 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {emp.failedDeductionRate}% failed/unmatched deductions
                  </p>
                )}
              </div>

              {/* Bottom Financial Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-container text-xs">
                <div>
                  <span className="text-[9px] font-bold text-secondary uppercase block">Avg Employee Salary</span>
                  <span className="font-bold text-on-surface">{formatMWK(emp.avgSalary)}</span>
                </div>
                <div>
                  <span className="text-[9px] font-bold text-secondary uppercase block">Active Exposure</span>
                  <span className="font-bold text-primary">{formatMWK(emp.totalDisbursed)}</span>
                </div>
              </div>

              {/* 6-Month Risk Forecast (Fix 5: Honest Data Requirement) */}
              {(() => {
                const pred = computeEmployerRiskPrediction(emp.employer, payrollRecords);
                return (
                  <div className="pt-2 border-t border-surface-container text-[10px] space-y-1">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-secondary">6-Month Trend Forecast:</span>
                      {pred.hasSufficientData ? (
                        <span className={`font-bold ${pred.predictedRisk === 'High' ? 'text-red-600' : pred.predictedRisk === 'Medium' ? 'text-amber-600' : 'text-green-600'}`}>
                          {pred.predictedRisk} Risk Forecast ({pred.monthsOfData} months)
                        </span>
                      ) : (
                        <span className="text-gray-400 font-bold italic">Insufficient historical data</span>
                      )}
                    </div>
                    <p className="text-[9px] text-gray-500 dark:text-gray-400 leading-tight">
                      {pred.reason}
                    </p>
                  </div>
                );
              })()}

              {/* Trend Badge */}
              <div className="flex items-center justify-between text-[10px] text-secondary font-semibold pt-1">
                <span>Current Operational Risk Trend:</span>
                <span className={`flex items-center gap-0.5 font-bold ${
                  emp.riskTrend === 'Deteriorating' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {emp.riskTrend === 'Deteriorating' ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                  {emp.riskTrend}
                </span>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
