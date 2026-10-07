import { governanceRepository, type DecisionHistoryEntry } from '../repositories/governanceRepository';
import { createAuditLog } from '../db';

export const aiGovernanceService = {
  async recordOfficerOverride(payload: {
    applicationId: string;
    aiRecommendation: string;
    aiConfidence: number;
    aiSignals: string[];
    officerId: string;
    officerDecision: string;
    overrideReason?: string;
  }): Promise<DecisionHistoryEntry> {
    if (!payload.applicationId) throw new Error('Application ID is required');
    if (!payload.officerDecision) throw new Error('Officer decision is required');

    const isOverride = payload.aiRecommendation !== payload.officerDecision;

    const entry: DecisionHistoryEntry = {
      id: `dh-${payload.applicationId}-${Date.now()}`,
      applicationId: payload.applicationId,
      aiRecommendation: payload.aiRecommendation,
      aiConfidence: payload.aiConfidence,
      aiSignals: payload.aiSignals || [],
      officerId: payload.officerId,
      officerDecision: payload.officerDecision,
      isOverride,
      overrideReason: payload.overrideReason || (isOverride ? 'Manual officer review override' : undefined),
      decidedAt: new Date().toISOString(),
    };

    const saved = await governanceRepository.saveDecision(entry);

    // Audit log entry for governance compliance
    await createAuditLog({
      id: `audit-gov-${saved.id}`,
      occurredAt: new Date().toISOString(),
      actorId: payload.officerId,
      actorName: 'Loan Officer',
      actorRole: 'loan_officer',
      action: isOverride ? 'governance.ai_recommendation_override' : 'governance.ai_recommendation_accepted',
      entityType: 'loan_application',
      entityId: payload.applicationId,
      outcome: 'success',
      summary: isOverride
        ? `Officer overridden AI Recommendation (${payload.aiRecommendation} -> ${payload.officerDecision}): ${payload.overrideReason}`
        : `Officer accepted AI Recommendation (${payload.aiRecommendation})`,
    });

    return saved;
  },

  async getDecisionHistory(applicationId?: string): Promise<DecisionHistoryEntry[]> {
    if (applicationId) {
      return governanceRepository.findDecisionsByApplication(applicationId);
    }
    return governanceRepository.findAllDecisions();
  },
};

