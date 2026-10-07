import React from 'react';
import { UserCheck, Award, CheckCircle, Clock, ShieldAlert, FileText, AlertCircle } from 'lucide-react';
import type { OfficerQualityMetrics } from '../types';

interface OfficerQualityScorecardProps {
  officers: OfficerQualityMetrics[];
}

export default function OfficerQualityScorecard({ officers }: OfficerQualityScorecardProps) {
  if (officers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <Award className="w-5 h-5 text-orange-500" /> Officer Decision Quality Scorecard
          </h2>
          <p className="text-xs text-secondary">Evaluates decision quality, approved loan repayment performance, and compliance enforcement.</p>
        </div>
        <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 px-3 py-1 rounded-full">
          Quality & Compliance Active
        </span>
      </div>

      <div className="border border-outline-variant rounded-2xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-container-low border-b border-surface-container text-secondary font-bold uppercase tracking-wider">
                <th className="p-4">Loan Officer</th>
                <th className="p-4">Reviewed</th>
                <th className="p-4">Approval Rate</th>
                <th className="p-4">Approved Cohort Repayment %</th>
                <th className="p-4">Doc Rejection Rate</th>
                <th className="p-4">Avg Speed</th>
                <th className="p-4">Quality Rating</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {officers.map(off => {
                const isHighQuality = off.repaymentPerformanceApproved >= 95 && off.documentRejectionRate >= 5;

                return (
                  <tr key={off.officerId} className="hover:bg-surface-container-low transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-950/30 flex items-center justify-center font-bold text-orange-700 text-xs">
                          {off.officerName.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-on-surface">{off.officerName}</p>
                          <p className="text-[10px] text-secondary">ID: {off.officerId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 font-semibold text-on-surface">
                      {off.reviewedCount} apps
                    </td>
                    <td className="p-4">
                      <span className="font-bold text-on-surface">{off.approvalRatio}%</span>
                      <span className="text-[10px] text-secondary block">({off.approvedCount} Approved / {off.declinedCount} Declined)</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="font-bold text-green-700 dark:text-green-400">{off.repaymentPerformanceApproved}%</span>
                      </div>
                      <span className="text-[10px] text-secondary block">On-time collection on approved loans</span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-bold text-on-surface">{off.documentRejectionRate}%</span>
                      </div>
                      <span className="text-[10px] text-secondary block">Invalid docs caught</span>
                    </td>
                    <td className="p-4 text-secondary">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span className="font-semibold">{off.avgProcessingTimeHours} hours</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        isHighQuality ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {isHighQuality ? '★ Exemplary' : 'Standard Quality'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
