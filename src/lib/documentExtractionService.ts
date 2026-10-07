/**
 * PINACO Smart Advisor — Document Extraction & Comparison Service
 *
 * ARCHITECTURAL NOTICE:
 * This service provides the extraction architecture & validation interface.
 * Future integration point for production OCR / Document AI providers (e.g. AWS Textract, Google Cloud Document AI).
 *
 * Current implementation supports structured manual field entry and simulated
 * provider responses for testing document mismatch detection against Loan Applications.
 * It NEVER pretends to perform real OCR when it has not.
 */

import type { DocumentExtraction, ExtractedFieldData, LoanApplication } from '../types';

export interface DocumentExtractionRequest {
  documentId: string;
  applicationId?: string;
  userId?: string;
  documentType: 'Payslip' | 'Employment Letter' | 'National ID' | 'Other';
  manualData?: ExtractedFieldData;
  source?: 'manual' | 'ocr_provider' | 'ai_provider';
}

/**
 * Compares extracted document field data against a loan application to identify mismatches.
 */
export function compareExtractedDataWithApplication(
  docType: string,
  extracted: ExtractedFieldData,
  app: LoanApplication
): { status: 'Matched' | 'Mismatch' | 'Pending'; mismatches: string[] } {
  const mismatches: string[] = [];

  if (docType === 'Payslip') {
    // 1. Salary comparison
    if (extracted.monthlySalary !== undefined && app.monthlyRevenue) {
      // Allow 10% variance for tax/deductions
      const diff = Math.abs(extracted.monthlySalary - app.monthlyRevenue);
      const pctDiff = (diff / app.monthlyRevenue) * 100;
      if (pctDiff > 10) {
        mismatches.push(
          `Salary Mismatch: Application declares MWK ${app.monthlyRevenue.toLocaleString()}, but Payslip shows MWK ${extracted.monthlySalary.toLocaleString()}`
        );
      }
    }

    // 2. Employer comparison
    if (extracted.employer && app.sector) {
      const appEmp = (app.businessName || app.sector).toLowerCase();
      const docEmp = extracted.employer.toLowerCase();
      if (!appEmp.includes(docEmp.split(' ')[0]) && !docEmp.includes(appEmp.split(' ')[0])) {
        mismatches.push(
          `Employer Mismatch: Application lists "${app.businessName || app.sector}", but Payslip shows "${extracted.employer}"`
        );
      }
    }
  }

  if (docType === 'National ID') {
    // Name comparison
    if (extracted.applicantName && app.applicantName) {
      const appNameParts = app.applicantName.toLowerCase().split(' ');
      const docName = extracted.applicantName.toLowerCase();
      const hasLastName = appNameParts.some(part => part.length > 2 && docName.includes(part));
      if (!hasLastName) {
        mismatches.push(
          `Name Mismatch: Application name "${app.applicantName}" differs from ID name "${extracted.applicantName}"`
        );
      }
    }
  }

  const status = mismatches.length > 0 ? 'Mismatch' : 'Matched';
  return { status, mismatches };
}

/**
 * Processes a document extraction request and returns a complete DocumentExtraction entity.
 * FUTURE EXTENSION: Replace the `switch (req.source)` block below with a fetch call
 * to a real Document AI REST endpoint.
 */
export function processDocumentExtraction(
  req: DocumentExtractionRequest,
  app?: LoanApplication
): DocumentExtraction {
  const source = req.source || 'manual';
  const extractedData = req.manualData || {};

  let confidence = 100;
  if (source === 'manual') {
    confidence = 100; // Manual input entered by staff/user
  } else if (source === 'ocr_provider') {
    confidence = 88; // Simulated OCR confidence
  } else if (source === 'ai_provider') {
    confidence = 94; // Simulated Document AI confidence
  }

  let verificationStatus: 'Matched' | 'Mismatch' | 'Pending' = 'Pending';
  let mismatches: string[] = [];

  if (app) {
    const res = compareExtractedDataWithApplication(req.documentType, extractedData, app);
    verificationStatus = res.status;
    mismatches = res.mismatches;
  }

  return {
    id: `ext-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    documentId: req.documentId,
    applicationId: req.applicationId,
    userId: req.userId,
    documentType: req.documentType,
    extractedData,
    confidence,
    source,
    verificationStatus,
    mismatches,
    createdAt: new Date().toISOString(),
  };
}
