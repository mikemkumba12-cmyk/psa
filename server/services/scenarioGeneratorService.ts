export type DemoScenario = 'Healthy Portfolio' | 'High Default Risk' | 'Payroll Crisis';

export interface DemoScenarioState {
  activeScenario: DemoScenario;
  portfolioHealthPct: number;
  collectionRatePct: number;
  delinquentLoansCount: number;
  payrollMatchPct: number;
  description: string;
}

let activeScenarioState: DemoScenarioState = {
  activeScenario: 'Healthy Portfolio',
  portfolioHealthPct: 96.5,
  collectionRatePct: 98.2,
  delinquentLoansCount: 2,
  payrollMatchPct: 98.5,
  description: 'Baseline operational state — high collection reliability and low portfolio risk.',
};

export const scenarioGeneratorService = {
  getActiveScenario(): DemoScenarioState {
    return activeScenarioState;
  },

  switchScenario(scenario: DemoScenario): DemoScenarioState {
    if (scenario === 'Healthy Portfolio') {
      activeScenarioState = {
        activeScenario: 'Healthy Portfolio',
        portfolioHealthPct: 96.5,
        collectionRatePct: 98.2,
        delinquentLoansCount: 2,
        payrollMatchPct: 98.5,
        description: 'Baseline operational state — high collection reliability and low portfolio risk.',
      };
    } else if (scenario === 'High Default Risk') {
      activeScenarioState = {
        activeScenario: 'High Default Risk',
        portfolioHealthPct: 72.0,
        collectionRatePct: 81.4,
        delinquentLoansCount: 14,
        payrollMatchPct: 88.0,
        description: 'Stress scenario — elevated borrower defaults across retail and transport sectors.',
      };
    } else if (scenario === 'Payroll Crisis') {
      activeScenarioState = {
        activeScenario: 'Payroll Crisis',
        portfolioHealthPct: 64.5,
        collectionRatePct: 68.0,
        delinquentLoansCount: 22,
        payrollMatchPct: 58.2,
        description: 'Systemic exception scenario — major public employer deduction delays across 2 key ministries.',
      };
    }
    return activeScenarioState;
  },

  resetScenario(): DemoScenarioState {
    return this.switchScenario('Healthy Portfolio');
  },
};
