# PINACO Smart Advisor — API Reference Guide (v1)

**Base URL:** `/api/v1`  
**Authentication:** Bearer JWT in `Authorization` header OR HTTP-Only cookie (`psa_access_token`)  

---

## 1. Authentication Endpoints

### `POST /api/v1/auth/login`
Authenticates a staff or customer user.
- **Request Body**: `{"email": "c.banda@pinnacle.mw", "password": "Password123!"}`
- **Response**: `200 OK` `{ "success": true, "user": {...}, "accessToken": "eyJ..." }`

### `POST /api/v1/auth/refresh`
Refreshes an expired access token using the HTTP-Only refresh token.
- **Response**: `200 OK` `{ "success": true, "accessToken": "eyJ..." }`

### `POST /api/v1/auth/logout`
Clears authentication cookies and invalidates session.

---

## 2. Customer Intelligence Endpoints

### `GET /api/v1/customers`
Retrieves customer directory.

### `GET /api/v1/customers/:id/intelligence`
Fetches complete 360 profile intelligence including relationship score, timeline, and LTV.
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "customerId": "cust-001",
    "relationshipScore": { "score": 88, "tier": "High", ... },
    "timeline": [...],
    "ltv": { "totalBorrowed": 1450000, "estimatedLtv": 2100000 }
  }
  ```

---

## 3. Loan & Credit Endpoints

### `GET /api/v1/loans`
Lists loan applications.

### `GET /api/v1/loans/:id/recommendation`
Generates server-side credit recommendation and affordability analysis for a specific loan application.

---

## 4. Governance & Scenario Endpoints

### `POST /api/v1/governance/override`
Records a human loan officer override of an AI credit recommendation.

### `GET /api/v1/scenarios/active`
Gets the active demo scenario state (`Healthy Portfolio`, `High Default Risk`, `Payroll Crisis`).

### `POST /api/v1/scenarios/switch`
Switches operational demo scenario.
