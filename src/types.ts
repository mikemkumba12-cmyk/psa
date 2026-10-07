// ── Pinnacle Smart Advisor — Domain Types ─────────────────────────────────────
// Single source of truth for all domain models. All services, stores, and
// components must import types from here — never define them inline.

// ── Core Lending Types ────────────────────────────────────────────────────────

export interface LoanApplication {
  id: string;
  /** The ID of the authenticated user who submitted this application */
  userId?: string;
  applicantName: string;
  email: string;
  phone: string;
  address: string;
  businessName: string;
  monthlyRevenue: number;
  staffCount: number;
  amount: number;
  /** Loan term in months e.g. 6, 12, 18, 24 */
  termMonths?: number;
  /** Monthly interest rate as a percentage e.g. 3.5 */
  interestRate?: number;
  status: 'Under Review' | 'In Progress' | 'Approved' | 'Decline' | 'Pending Doc' | 'Disbursed' | 'Reviewing' | 'Completed' | 'Active' | 'Rejected';
  sector: string;
  date: string;
  /** ISO date string when loan was disbursed */
  disbursedAt?: string;
  /** ISO date string when loan was fully repaid */
  completedAt?: string;
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  repaymentHistory: string;
  debtToIncome: string;
  yearsInBusiness: string;
  notes?: string;
  /** Assigned loan officer */
  loanOfficer?: string;
  /** Branch that processed the application */
  branchId?: string;
  dataSource?: 'demo' | 'user' | 'imported';
}

export interface Repayment {
  id: string;
  /** Links repayment to the source loan application */
  applicationId?: string;
  /** Links repayment to the authenticated user */
  userId?: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  /** Principal component of installment */
  principal?: number;
  /** Interest component of installment */
  interest?: number;
  /** Late penalty (0 if paid on time) */
  penalty?: number;
  status: 'Paid' | 'Upcoming' | 'Scheduled' | 'Overdue' | 'FAILED_DEDUCTION';
  /** ISO date when payment was made */
  paidAt?: string;
  failureReason?: string;
}

export interface ChatConversation {
  id: string;
  senderName: string;
  avatarUrl: string;
  lastMessage: string;
  timestamp: string;
  unreadCount: number;
  isOnline: boolean;
}

export interface AlertNotification {
  id: string;
  /** If set, notification is only shown to this user. If absent, visible to all admins. */
  userId?: string;
  type: 'critical' | 'approval' | 'opportunity' | 'info' | 'warning';
  title: string;
  description: string;
  date: string;
  isRead?: boolean;
  imageBackground?: string;
  actionLabel?: string;
  /** Deep-link route within the app e.g. /client/loans */
  actionRoute?: string;
}

export interface Customer {
  id: string;
  name: string;
  location: string;
  sector: string;
  activeLoans: number;
  status: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  iconType: 'person' | 'storefront' | 'business' | 'warning';
  /** Links to a StoredUser id when the customer has a portal account */
  userId?: string;
  phone?: string;
  email?: string;
  joinedAt?: string;
  customerType?: 'New' | 'Existing';
  employeeNumber?: string;
  nationalId?: string;
  isActivated?: boolean;
  dataSource?: 'demo' | 'user' | 'imported';
}

// ── Organisation Types ────────────────────────────────────────────────────────

export interface Branch {
  id: string;
  name: string;
  location: string;
  manager: string;
  phone: string;
  email: string;
  openedAt: string;
  activeLoans: number;
  totalDisbursed: number;
}

export interface LoanOfficer {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  email: string;
  phone: string;
  activeLoans: number;
  disbursedThisMonth: number;
  collectionRate: number;
  joinedAt: string;
  avatar?: string;
}

export interface LoanProduct {
  id: string;
  name: string;
  description: string;
  minAmount: number;
  maxAmount: number;
  minTermMonths: number;
  maxTermMonths: number;
  /** Monthly interest rate as a percentage */
  interestRate: number;
  targetSegment: 'individual' | 'sme' | 'both';
  isActive: boolean;
}

// ── User & Auth Types ─────────────────────────────────────────────────────────

export type UserRole = 'customer' | 'loan_officer' | 'manager' | 'executive' | 'admin';

export interface StoredUser {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  address: string;
  nationalId: string;
  dob: string;
  gender: string;
  employmentType: string;
  employer: string;
  monthlyIncome: string;
  customerType: 'individual' | 'sme'; // UI type
  customerClassification?: 'New' | 'Existing';
  passwordHash: string;
  securityQuestion: string;
  securityAnswerHash: string;
  createdAt: string;
  notificationPrefs: { sms: boolean; email: boolean; push: boolean };
  /** Optional title for staff accounts e.g. "Senior Loan Officer" */
  staffTitle?: string;
  /** Avatar URL — falls back to initials if absent */
  avatar?: string;
  employeeNumber?: string;
  isActivated?: boolean;
}

// ── SME Platform Types ────────────────────────────────────────────────────────

export type BusinessVerificationStatus = 'Draft' | 'Pending Verification' | 'Verified' | 'Needs Documents';
export type FinancingRequestStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Approved' | 'Declined';
export type BusinessDocumentStatus = 'Pending' | 'Uploaded' | 'Verified' | 'Rejected';

export interface BusinessOwner {
  customerId: string;
  customerName: string;
  role: 'Primary Owner' | 'Co-owner' | 'Director' | 'Guarantor';
  ownershipPct: number;
  linkedAt: string;
}

export interface BusinessDocument {
  id: string;
  businessId: string;
  name: string;
  category: 'Registration' | 'Tax' | 'Bank Statement' | 'Financials' | 'Permit' | 'Other';
  status: BusinessDocumentStatus;
  uploadedAt?: string;
  size?: number;
}

export interface BusinessTimelineEvent {
  id: string;
  businessId: string;
  date: string;
  title: string;
  detail: string;
  type: 'registration' | 'document' | 'financing' | 'verification' | 'relationship';
}

export interface FinancingRequest {
  id: string;
  businessId: string;
  productName: string;
  amount: number;
  termMonths: number;
  purpose: string;
  status: FinancingRequestStatus;
  submittedAt: string;
}

export interface SmeBusiness {
  id: string;
  customerId: string;
  customerName: string;
  name: string;
  registrationNumber: string;
  sector: string;
  industryCategory: string;
  location: string;
  verificationStatus: BusinessVerificationStatus;
  relationshipManager: string;
  riskLevel: 'Low' | 'Medium' | 'High';
  annualRevenue: number;
  monthlyRevenue: number;
  employees: number;
  yearsInBusiness: number;
  healthScore: number;
  owners: BusinessOwner[];
  documents: BusinessDocument[];
  timeline: BusinessTimelineEvent[];
  financingRequests: FinancingRequest[];
}

// ── Intelligence Platform Types ────────────────────────────────────────────────

export type CustomerSegment =
  | 'Young Entrepreneur'
  | 'Reliable Borrower'
  | 'High Risk'
  | 'SME Growth'
  | 'Inactive'
  | 'Premium Client';

export interface FinancialHealthScore {
  composite: number;
  repaymentScore: number;
  incomeStabilityScore: number;
  debtScore: number;
  businessScore: number;
  tier: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  tierColor: string;
}

export interface ExpertRule {
  id: string;
  name: string;
  condition: string;
  fired: boolean;
  confidence: number;
}

export interface ExpertRecommendation {
  verdict: 'Approve' | 'Decline' | 'Review' | 'Request Docs';
  confidence: number;
  primaryReason: string;
  explanation: string;
  suggestedAmount?: number;
  rulesFired: ExpertRule[];
  segment: CustomerSegment;
  healthScore: FinancialHealthScore;
}

export interface FraudFlag {
  id: string;
  applicationId: string;
  signal: string;
  severity: 'Low' | 'Medium' | 'High';
  description: string;
}

export interface SectorTrend {
  sector: string;
  defaultRate: number;
  avgRepayment: number;
  totalDisbursed: number;
  growth: number;
  riskRating: 'Low' | 'Medium' | 'High';
  insight: string;
}

export interface PortfolioTimePoint {
  month: string;
  disbursed: number;
  collected: number;
  newCustomers: number;
  defaults: number;
}

export interface SegmentDistribution {
  segment: CustomerSegment;
  count: number;
  color: string;
  percentage: number;
}

export interface DataMiningInsight {
  id: string;
  category: 'Pattern' | 'Anomaly' | 'Trend' | 'Alert';
  title: string;
  description: string;
  impact: 'Positive' | 'Negative' | 'Neutral';
  confidence: number;
  affectedSector?: string;
  dataSource?: string;
  calculationMethod?: string;
  businessMeaning?: string;
}

export interface EmployerPerformance {
  employer: string;
  employeeCount: number;
  activeLoans: number;
  totalDisbursed: number;
  totalCollected: number;
  successfulDeductionRate: number; // percentage e.g. 98.2
  failedDeductionRate: number;     // percentage e.g. 1.8
  avgSalary: number;
  riskRating: 'Low' | 'Medium' | 'High';
  riskTrend: 'Improving' | 'Stable' | 'Deteriorating';
}

export interface OfficerQualityMetrics {
  officerId: string;
  officerName: string;
  reviewedCount: number;
  approvedCount: number;
  declinedCount: number;
  approvalRatio: number; // percentage
  avgProcessingTimeHours: number;
  repaymentPerformanceApproved: number; // percentage on-time repayment of approved cohort
  documentRejectionRate: number; // percentage of documents rejected/caught
  defaultCount: number;
}

export interface CreditRecommendation {
  recommendation: 'Approve' | 'Review' | 'Decline';
  score: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  positiveSignals: string[];
  riskFactors: string[];
  suggestedAction: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  occurredAt: string;
  actorId: string;
  actorName: string;
  actorRole: 'customer' | 'loan_officer' | 'manager' | 'executive' | 'admin' | 'client' | 'staff' | 'system';
  action: string;
  entityType: string;
  entityId?: string;
  outcome: 'success' | 'failure' | 'info';
  summary: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}

// ── Payroll Types ────────────────────────────────────────────────────────────

export interface PayrollRecord {
  id: string;
  batchId: string;
  employeeId: string;
  customerName: string;
  customerId?: string; // matched customer id or null
  employer: string;
  amount: number;
  month: string;
  status: 'Matched' | 'Unmatched' | 'Applied' | 'Failed';
  repaymentId?: string;
  failureReason?: string;
}

export interface PayrollBatch {
  id: string;
  uploadedAt: string;
  uploadedBy: string;
  fileName: string;
  totalRecords: number;
  matched: number;
  applied: number;
  failed: number;
  month: string;
  status: 'Processing' | 'Completed' | 'Partial';
}

// ── Utility Types ─────────────────────────────────────────────────────────────

/** Currency value always in MWK (Malawian Kwacha) */
export type MWK = number;

/** Generic API response wrapper for service layer */
export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/** Per-user generated mock data bundle, keyed by userId in localStorage */
export interface UserMockDataBundle {
  userId: string;
  generatedAt: string;
  applications: LoanApplication[];
  repayments: Repayment[];
  alerts: AlertNotification[];
  business?: SmeBusiness;
}

// ── Phase 3 Domain Entities ───────────────────────────────────────────────────

export interface CustomerScoreConfig {
  completedLoanWeight: number;
  perfectRepaymentWeight: number;
  stableEmployerWeight: number;
  relationshipDurationWeight: number;
  failedDeductionPenalty: number;
  defaultPenalty: number;
  highDtiPenalty: number;
}

export interface CustomerRiskScore {
  id: string;
  customerId: string;
  score: number; // 0-100 or -1 for New Customer
  tier: 'High' | 'Good' | 'Fair' | 'Poor' | 'New Customer';
  positiveFactors: string[];
  negativeFactors: string[];
  createdAt: string;
}

export interface ExtractedFieldData {
  applicantName?: string;
  employer?: string;
  employeeNumber?: string;
  monthlySalary?: number;
  issueDate?: string;
  position?: string;
  nationalId?: string;
}

export interface DocumentExtraction {
  id: string;
  documentId: string;
  applicationId?: string;
  userId?: string;
  documentType: 'Payslip' | 'Employment Letter' | 'National ID' | 'Other';
  extractedData: ExtractedFieldData;
  confidence: number; // e.g. 95%
  source: 'manual' | 'ocr_provider' | 'ai_provider';
  verificationStatus: 'Matched' | 'Mismatch' | 'Pending';
  mismatches: string[];
  createdAt: string;
}

export interface CustomerRecommendation {
  id: string;
  customerId: string;
  customerName: string;
  recommendationType: 'Top-Up' | 'Limit Increase' | 'Standard' | 'Requires Assessment';
  currentLoanAmount: number;
  remainingBalance: number;
  recommendedAmount: number;
  confidence: number;
  postTopUpDti: number;
  reasons: string[];
  createdAt: string;
}

export interface EmployerRiskPrediction {
  id: string;
  employer: string;
  currentCollectionRate: number;
  historicalTrend: number[];
  predictedRisk: 'Low' | 'Medium' | 'High';
  monthsOfData: number;
  hasSufficientData: boolean;
  reason: string;
  createdAt: string;
}

export interface CustomerRiskTimelineEntry {
  id: string;
  customerId: string;
  date: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'New';
  score: number;
  triggerEvent: string;
  details: string;
}

export interface CustomerLifetimeValue {
  customerId: string;
  customerName: string;
  totalBorrowed: number;
  interestGenerated: number;
  completedLoans: number;
  relationshipMonths: number;
  ltv: number;
  meaning: string;
}
