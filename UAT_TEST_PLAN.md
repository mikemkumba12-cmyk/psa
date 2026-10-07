# PINACO Smart Advisor — User Acceptance Testing (UAT) Plan

**Date:** July 21, 2026  
**Target Audience:** PINACO MFI Staff & Selected Test Borrowers  
**Environment:** Staging Environment (`https://staging-advisor.pinnacle.mw`)  

---

## Executive Summary

This UAT Test Plan details structured test cases for all 5 user roles in the PINACO Smart Advisor platform. Each test case specifies purpose, step-by-step execution instructions, expected results, and pass/fail criteria.

---

## Role 1: Loan Officer Test Suite

### TC-OFF-01: Review Queue & Credit Recommendation Evaluation
- **Purpose**: Verify that the Loan Officer can view pending applications, examine AI risk scores, and process loan approvals.
- **Steps**:
  1. Log in with `chisomo@pinnacle.mw` / `Password123!`.
  2. Navigate to **Applications / Assessment Queue**.
  3. Select application `APP-2026-004` (Yamikani Phiri).
  4. Inspect the **Credit Recommendation** tab (AI Score, Financial Health Score, Risk Factors).
  5. Click **Approve Loan**, enter note `"Verified payslip with Ministry of Education"`, and click Submit.
- **Expected Result**: Application status changes to `Approved`. Audit log and AI Governance override telemetry record the action.
- **Pass/Fail**: [ ] Pass  [ ] Fail

### TC-OFF-02: Document Verification & Extraction
- **Purpose**: Verify OCR document field extraction and mismatch flagging.
- **Steps**:
  1. Open application `APP-2026-005`.
  2. Open the **Document Verification Panel**.
  3. Upload sample payslip document.
  4. Compare extracted monthly salary against applicant reported salary.
- **Expected Result**: System highlights matches in green and flags salary discrepancies exceeding 10%.
- **Pass/Fail**: [ ] Pass  [ ] Fail

---

## Role 2: Branch Manager Test Suite

### TC-MGR-01: Employer Risk Analysis & Payroll Exception Review
- **Purpose**: Evaluate employer risk metrics and handle unmatched payroll deduction records.
- **Steps**:
  1. Log in with `grace@pinnacle.mw` / `Password123!`.
  2. Navigate to **Employer Intelligence** tab.
  3. Search for employer `"Ministry of Education"`.
  4. Review collection rate (e.g. 98.2%), risk rating, and historical trend.
  5. Navigate to **Payroll Processing** -> **Exceptions Queue**.
  6. Manually match an unmatched payroll record to customer `cust-102`.
- **Expected Result**: Deduction is applied, remaining loan balance is updated, and record status changes to `Applied`.
- **Pass/Fail**: [ ] Pass  [ ] Fail

---

## Role 3: Executive Test Suite

### TC-EXEC-01: Portfolio Health & Scenario Stress Simulation
- **Purpose**: Assess high-level portfolio KPIs, sector breakdown, and stress testing.
- **Steps**:
  1. Log in with `kondwani@pinnacle.mw` / `Password123!`.
  2. View **Executive Overview** dashboard (Total Disbursed, Collection Rate, NPL Rate).
  3. Open **Scenario Switcher** in top navigation.
  4. Select **"Payroll Crisis"** scenario and click Apply.
  5. Observe real-time update of portfolio risk charts and alert feeds.
  6. Reset scenario back to **"Healthy Portfolio"**.
- **Expected Result**: Executive dashboard updates dynamically with simulated stress metrics and restores cleanly upon reset.
- **Pass/Fail**: [ ] Pass  [ ] Fail

---

## Role 4: Administrator Test Suite

### TC-ADM-01: System Governance & Staff User Management
- **Purpose**: Manage staff access permissions and review immutable system audit logs.
- **Steps**:
  1. Log in with `admin@pinnacle.mw` / `Password123!`.
  2. Navigate to **System Administration** -> **User Management**.
  3. Create new staff user: Name `"Tiwonge Banda"`, Role `"loan_officer"`, Email `"tiwonge@pinnacle.mw"`.
  4. Navigate to **Audit Trail**.
  5. Filter audit logs by Action `auth.register` and verify new user creation entry.
- **Expected Result**: New staff user is saved and appears in the user directory. Audit log records `staff_user.create` event.
- **Pass/Fail**: [ ] Pass  [ ] Fail

---

## Role 5: Customer Portal Test Suite

### TC-CUST-01: Customer Self-Service Loan Application
- **Purpose**: Verify borrower onboarding, loan application submission, and repayment tracking.
- **Steps**:
  1. Navigate to client portal (`/client/login`).
  2. Log in with registered customer credentials.
  3. Click **Apply for Financing**.
  4. Enter loan amount `MWK 500,000`, select term `12 months`, sector `Civil Service`.
  5. Click **Submit Application**.
  6. Navigate to **My Loans** tab to view application status.
- **Expected Result**: Loan application is assigned a unique ID, enters `Under Review` status, and notification email/SMS is triggered.
- **Pass/Fail**: [ ] Pass  [ ] Fail

---

*UAT Plan created by Antigravity AI Engine — PINACO Smart Advisor*
