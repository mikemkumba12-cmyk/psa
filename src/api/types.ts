// Shapes returned by the Pinnacle API. Kept in one place so screens stay consistent with the server.

export type Role = 'customer' | 'loan_officer' | 'manager' | 'executive' | 'admin';

export interface Membership {
  id: string;
  memberNumber: string;
  status: 'pending' | 'active' | 'suspended' | 'terminated';
  joinedOn: string | null;
  verifiedAt: string | null;
}

export interface Profile {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string | null;
  staffTitle: string | null;
  approvalLimit: number | null;
  notificationPrefs: { sms: boolean; email: boolean; inApp: boolean };
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  isDemoAccount: boolean;
  passkeyCount: number;
  permissions: string[];
  customer: null | {
    id: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    nationalId: string | null;
    employeeNumber: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    employmentType: string | null;
    employerName: string | null;
    monthlyIncome: number | null;
    segment: 'individual' | 'sme';
    district: string | null;
    membership: Membership | null;
  };
}

export interface SessionResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
  profile: Profile;
}

export interface Branding {
  institutionName: string;
  shortName: string;
  legalName?: string | null;
  website?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  tollFree?: string | null;
  whatsapp?: string | null;
  regulatoryStatement?: string | null;
  logoUrl?: string | null;
  offices?: Array<{ city: string; address: string }>;
}

export interface ProductFee {
  name: string;
  type: 'fixed' | 'percent';
  value: number;
  deductedFromDisbursement: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  borrowerType: 'individual' | 'business';
  description: string;
  minAmount: number | null;
  maxAmount: number | null;
  minTermMonths: number | null;
  maxTermMonths: number | null;
  interestMethod: 'flat' | 'reducing_balance';
  interestRateMonthly: number | null;
  repaymentFrequency: 'monthly' | 'bullet';
  fees: ProductFee[];
  requiredDocuments: string[];
  membersOnly: boolean;
  collateralRequired: boolean;
  collateralNotes: string | null;
  status: 'draft' | 'active' | 'suspended' | 'retired';
  isAvailable: boolean;
  termsConfirmed?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isDemo?: boolean;
  activationBlockers?: string[];
}

export interface ScheduleLine {
  installmentNumber: number;
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
  balanceAfter?: number;
}

export interface Quote {
  principal: number;
  termMonths: number;
  monthlyRatePct: number;
  installmentAmount: number;
  totalInterest: number;
  totalRepayable: number;
  fees: Array<ProductFee & { amount: number }>;
  totalFees: number;
  netDisbursement: number;
  schedule: ScheduleLine[];
  repaymentFrequency: 'monthly' | 'bullet';
}

export interface DocumentType {
  code: string;
  label: string;
  ownerScope: 'customer' | 'business' | 'application' | 'any';
  hasExpiry: boolean;
  description: string | null;
}

export interface DocumentTypesResponse {
  types: DocumentType[];
  maxBytes: number;
  acceptedFormats: string;
  acceptedMimeTypes: string[];
}

export type DocumentStatus = 'pending_review' | 'verified' | 'rejected' | 'replaced' | 'deleted';

export interface StoredDocument {
  id: string;
  documentType: string;
  documentTypeLabel: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  expired: boolean;
  customerId: string | null;
  businessId: string | null;
  applicationId: string | null;
  uploadedBy: string | null;
  uploadedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  expiresOn: string | null;
}

export type ApplicationStatus =
  | 'draft' | 'submitted' | 'under_review' | 'info_requested' | 'assessed' | 'recommended'
  | 'approved' | 'rejected' | 'offer_issued' | 'offer_accepted' | 'offer_declined'
  | 'disbursed' | 'closed' | 'withdrawn';

export interface ApplicationSummary {
  id: string;
  reference: string;
  status: ApplicationStatus;
  borrowerType: 'individual' | 'business';
  applicantName: string;
  customerId: string;
  businessId: string | null;
  businessName: string | null;
  productId: string;
  productName: string;
  productCategory: string;
  amount: number;
  termMonths: number;
  approvedAmount: number | null;
  assignedOfficerId: string | null;
  assignedOfficerName: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
}

export interface Requirement {
  code: string;
  label: string;
  ownerScope: string;
  documentId: string | null;
  status: 'missing' | 'pending_review' | 'verified' | 'rejected' | 'expired';
}

export interface Eligibility {
  eligible: boolean;
  reasons: string[];
  policyConfirmed: boolean;
}

export interface Figure {
  value: number | null;
  source: 'verified' | 'applicant' | 'estimated' | 'missing';
  note?: string;
}

export interface Indicator {
  code: string;
  severity: 'info' | 'caution' | 'concern';
  message: string;
}

export interface Assessment {
  id: string;
  assessedBy: string | null;
  inputs: Record<string, Figure> & { overrides?: Record<string, unknown> };
  results: Record<string, any>;
  indicators: Indicator[];
  missingInformation: string[];
  officerSummary: string | null;
  createdAt: string;
}

export interface AssessmentPreview {
  inputs: Record<string, Figure>;
  results: Record<string, number | null>;
  scenarios: Array<{ termMonths: number; installment: number; ratio: number | null; ratioLabel: string }>;
  indicators: Indicator[];
  missingInformation: string[];
  thresholdsConfirmed: boolean;
}

export interface Offer {
  id: string;
  amount: number;
  termMonths: number;
  interestRateMonthly: number;
  interestMethod: string;
  repaymentFrequency: string;
  fees: Array<ProductFee & { amount: number }>;
  totalFees: number;
  installmentAmount: number;
  totalRepayable: number;
  schedule: { lines: ScheduleLine[]; netDisbursement: number; note: string };
  conditions: string | null;
  status: 'issued' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  expiresAt: string;
  issuedAt: string;
  respondedAt: string | null;
}

export interface LoanPosition {
  outstandingPrincipal: number;
  outstandingTotal: number;
  paidTotal: number;
  arrearsAmount: number;
  daysPastDue: number;
  nextDue: { date: string; amount: number } | null;
  installmentsPaid: number;
  installmentsTotal: number;
}

export interface Transaction {
  id: string;
  type: 'disbursement' | 'repayment';
  amount: number;
  valueDate: string;
  channel: string;
  status: 'pending_confirmation' | 'confirmed' | 'rejected';
  externalReference?: string;
  recordedBy?: string;
  confirmedBy?: string;
  recordedAt: string;
  confirmedAt?: string;
  rejectionReason?: string;
  notes?: string;
}

export interface ApplicationDetail extends ApplicationSummary {
  purpose: string | null;
  declared: Record<string, any>;
  interestRateMonthly: number | null;
  product: {
    id: string; name: string; category: string; interestMethod: string; repaymentFrequency: string;
    minAmount: number | null; maxAmount: number | null; minTermMonths: number | null; maxTermMonths: number | null;
    membersOnly: boolean; collateralRequired: boolean;
  };
  infoRequestNote: string | null;
  recommendation?: 'approve' | 'decline' | null;
  recommendationNote?: string | null;
  recommendedBy?: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  approvedTermMonths: number | null;
  disbursedAt: string | null;
  closedAt: string | null;
  requirements: Requirement[];
  eligibility: Eligibility;
  timeline: Array<{ from: string | null; to: string; note: string | null; at: string; actorName: string | null }>;
  assessments: Assessment[];
  offers: Offer[];
  position: LoanPosition | null;
  schedule: Array<ScheduleLine & { paid: number; status: 'paid' | 'overdue' | 'partially_paid' | 'scheduled' }>;
  transactions: Transaction[];
  allowedActions: string[];
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Business {
  id: string;
  registeredName: string;
  tradingName: string | null;
  registrationNumber: string | null;
  legalStructure: string;
  tpin: string | null;
  sector: string;
  district: string;
  physicalAddress: string | null;
  dateEstablished: string | null;
  employeeCount: number | null;
  description: string | null;
  verificationStatus: 'unverified' | 'pending_verification' | 'verified' | 'rejected';
  verificationNote: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  myRoles?: string[];
}

export interface BusinessParty {
  id: string;
  customerId: string;
  name: string;
  nationalId: string | null;
  phone: string | null;
  role: 'owner' | 'director' | 'beneficial_owner' | 'representative' | 'guarantor';
  ownershipPct: number | null;
  isSignatory: boolean;
  verified: boolean;
  verifiedAt: string | null;
  authorizationDocumentId: string | null;
  authorizationStatus: string | null;
  membership: { memberNumber: string; status: string; verified: boolean } | null;
}

export interface BusinessFinancials {
  id: string;
  periodStart: string;
  periodEnd: string;
  avgMonthlyRevenue: number;
  avgMonthlyCostOfSales: number;
  avgMonthlyOperatingExpenses: number;
  existingMonthlyDebtService: number;
  largestCustomerShare: number | null;
  source: 'applicant' | 'verified';
  supportingDocumentId: string | null;
  notes: string | null;
  recordedBy: string | null;
  createdAt: string;
}

export interface BusinessDetail extends Business {
  parties: BusinessParty[];
  financials: BusinessFinancials[];
  applications: Array<{ id: string; reference: string; status: ApplicationStatus; amount: number; termMonths: number; productName: string; submittedAt: string | null }>;
}

export interface NotificationItem {
  id: string;
  type: 'info' | 'success' | 'warning' | 'action';
  title: string;
  body: string;
  actionRoute: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  staffTitle: string | null;
  isActive: boolean;
  approvalLimit: number | null;
  lastLoginAt: string | null;
  createdAt: string;
  mustChangePassword: boolean;
  productIds: string[];
  grants: string[];
  denies: string[];
  effectivePermissions?: string[];
}

export interface CustomerSummary {
  id: string;
  fullName: string;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  district: string | null;
  segment: 'individual' | 'sme';
  employerName: string | null;
  employeeNumber: string | null;
  monthlyIncome: number | null;
  hasPortalAccount: boolean;
  createdAt: string;
  isDemo: boolean;
  membership: (Membership & { verifiedAt: string | null }) | null;
  applicationCount?: number;
}
