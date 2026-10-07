export interface DecisionHistoryEntry {
  id: string;
  applicationId: string;
  aiRecommendation: string;
  aiConfidence: number;
  aiSignals: string[];
  officerId: string;
  officerDecision: string;
  isOverride: boolean;
  overrideReason?: string;
  decidedAt: string;
}

const decisionHistoryStore: DecisionHistoryEntry[] = [];

export const governanceRepository = {
  async saveDecision(entry: DecisionHistoryEntry): Promise<DecisionHistoryEntry> {
    decisionHistoryStore.unshift(entry);
    return entry;
  },

  async findAllDecisions(): Promise<DecisionHistoryEntry[]> {
    return decisionHistoryStore;
  },

  async findDecisionsByApplication(applicationId: string): Promise<DecisionHistoryEntry[]> {
    return decisionHistoryStore.filter(d => d.applicationId === applicationId);
  },
};
