# PINACO Smart Advisor — Production REST API Specification (v1)
**Version:** 1.0.0  
**Base URL:** `/api/v1`  
**Security:** Bearer JWT in `Authorization` Header OR HTTP-Only Cookie (`psa_access_token`, `psa_refresh_token`)

---

## 1. Authentication & Session Management (`/api/v1/auth`)

### `POST /api/v1/auth/login`
Authenticates a staff or customer user, returning a JWT token and setting HTTP-only cookie.

* **Request Body:**
  ```json
  {
    "email": "c.banda@pinnacle.mw",
    "password": "Password123!"
  }
  ```
* **Response (200 OK):**
  ```json
  {
    "success": true,
    "user": {
      "id": "lo-001",
      "email": "c.banda@pinnacle.mw",
      "name": "Chisomo Banda",
      "role": "Loan Officer",
      "branchId": "branch-lil"
    },
    "accessToken": "eyJhbGciOiJIUzI1Ni..."
  }
  ```

### `POST /api/v1/auth/refresh`
Exchanges HTTP-only refresh token for a new short-lived access token.

### `POST /api/v1/auth/logout`
Clears authentication cookies and invalidates user session.

---

## 2. Customer Management (`/api/v1/customers`)

### `GET /api/v1/customers`
Retrieves customer records (supports pagination and filtering).

* **Query Parameters:** `search`, `sector`, `riskLevel`, `limit`, `offset`
* **Response (200 OK):**
  ```json
  {
    "total": 20,
    "customers": [
      {
        "id": "cust-001",
        "name": "Samuel Chimwala",
        "sector": "Agriculture",
        "riskLevel": "Medium",
        "joinedAt": "2022-03-15"
      }
    ]
  }
  ```

### `GET /api/v1/customers/:id/intelligence`
Fetches complete 360 profile intelligence including relationship score, timeline, and LTV.

* **Response (200 OK):**
  ```json
  {
    "customerId": "cust-001",
    "relationshipScore": 88,
    "tier": "High",
    "positiveFactors": ["✓ 3 loans completed"],
    "negativeFactors": [],
    "ltv": 1450000,
    "timeline": []
  }
  ```

---

## 3. Loan Origination & Pre-Approvals (`/api/v1/loans`)

### `GET /api/v1/loans`
Lists portfolio loan applications.

### `POST /api/v1/loans`
Submits a new loan application.

### `GET /api/v1/loans/:id/recommendation`
Generates server-side credit recommendation and affordability analysis for a specific loan application.

* **Response (200 OK):**
  ```json
  {
    "applicationId": "APP-88421",
    "recommendation": "Approve",
    "riskLevel": "Medium",
    "score": 78,
    "debtToIncomePct": 22,
    "signals": ["✓ Employer payroll reliability 98%"],
    "confidence": 88
  }
  ```

---

## 4. Payroll Intelligence & Exception Management (`/api/v1/payroll`)

### `POST /api/v1/payroll/import`
Ingests payroll deduction batch CSV/JSON data.

### `GET /api/v1/payroll/exceptions`
Returns unmatched or failed payroll deduction records (`FAILED_DEDUCTION`).

### `GET /api/v1/payroll/employer/:name/performance`
Computes 6-month historical collection trend for an employer.

---

## 5. Intelligence Services (`/api/v1/intelligence`)

### `GET /api/v1/intelligence/top-up-opportunities`
Lists existing borrowers pre-approved for top-up expansion.

### `GET /api/v1/intelligence/employer-predictions`
Lists 6-month employer collection trend predictions and deteriorating risk flags.

---

## 6. AI Governance & Decision History (`/api/v1/governance`)

### `POST /api/v1/governance/override`
Records a human loan officer override of an AI credit recommendation.

* **Request Body:**
  ```json
  {
    "applicationId": "APP-102293",
    "aiRecommendation": "Review",
    "officerDecision": "Decline",
    "overrideReason": "Manual document verification revealed salary discrepancy on submitted payslip.",
    "officerId": "lo-003"
  }
  ```

---

## 7. Executive Scenario Switcher (`/api/v1/scenarios`)

### `POST /api/v1/scenarios/switch`
Switches active in-memory demo scenario (**`Healthy Portfolio`**, **`High Default Risk`**, **`Payroll Crisis`**).

* **Request Body:** `{"scenario": "Payroll Crisis"}`
