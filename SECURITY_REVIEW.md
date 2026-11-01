# PINACO Smart Advisor — Security Implementation & Verification Report

**Review date:** 1 November 2026  
**Target:** Flask backend, MongoDB persistence, browser frontend and AI health-chat workflow  
**Purpose:** Implementation baseline and pre-UAT verification plan  
**Status:** Starter implementation supplied; controls must be tested in the target environment before being marked PASSED.

## 1. Executive summary

PINACO Smart Advisor is designed to support account registration, authenticated access,
general health-information chat, conversation history and administrator review. This
implementation introduces layered controls for authentication, authorisation, request
validation, browser security, database access, rate limiting and auditability.

**Overall status: IMPLEMENTED BASELINE — NOT YET CERTIFIED OR 100% VERIFIED.**

## 2. Security control verification matrix

| # | Control | Implementation in this starter | Verification required | Current status |
|---|---|---|---|---|
| 1 | JWT expiration | 15-minute signed access tokens; expiry checked on every protected request | Test expired, malformed, wrong-signature and wrong-token-type tokens | Implemented; test pending |
| 2 | Refresh tokens | 7-day refresh token in HTTP-only, SameSite=Strict cookie; refresh token rotation and server-side session record | Verify cookie flags over HTTPS, rotation, replay rejection, logout revocation | Implemented; test pending |
| 3 | RBAC | `user` and `admin` roles; admin endpoints protected by role middleware | Verify ordinary users receive 403 from admin endpoints | Implemented; test pending |
| 4 | Password hashing | Bcrypt with 12 rounds; password minimum length 12 | Verify stored hashes and login success/failure; review password reset policy | Implemented; test pending |
| 5 | Injection protection | MongoDB filters are constructed from fixed keys; user input is treated as values, not query operators | Fuzz all endpoints with `$` operators, objects, arrays and malformed IDs | Implemented baseline; test pending |
| 6 | XSS protection | Jinja auto-escaping, DOM `textContent`, CSP and response headers | Test stored/reflected payloads in every user-controlled field | Implemented baseline; test pending |
| 7 | CORS | Explicit origin allowlist; credentials enabled only for configured origins | Verify approved origin succeeds and unapproved origin is rejected | Implemented; test pending |
| 8 | Rate limiting | Login/register: 10 requests per 15 minutes; AI chat: 20 per hour | Confirm 429 response and shared storage behavior in multi-instance deployment | Implemented in-memory; production Redis required |
| 9 | Cookie security | HTTP-only, SameSite=Strict, Secure configurable for HTTPS production | Inspect Set-Cookie headers in production; ensure `COOKIE_SECURE=true` | Implemented; deployment check pending |
| 10 | Audit logging | Login, registration, logout, AI generation and administrator review events recorded | Verify completeness, access restrictions, retention, tamper resistance and alerting | Implemented baseline; hardening pending |
| 11 | AI governance | Health-specific safety instructions, persisted conversations, admin review and human override telemetry | Clinician review, unsafe-prompt testing, override workflow and monitoring tests | Partially implemented; clinical/UAT validation pending |

## 3. Defense-in-depth architecture

```text
                 [ Browser / PINACO UI ]
                           |
                    HTTPS in production
                           |
             [ Security Headers + CORS ]
                           |
                    [ Rate Limiter ]
                           |
             [ JWT Authentication Layer ]
                           |
                [ RBAC Authorization ]
                           |
             [ Flask Routes / Services ]
                    /           \
                   /             \
       [ MongoDB Collections ]  [ AI Provider ]
       users / sessions        Health-safe prompt
       conversations           Response validation
       audit_logs               Error handling
                   \             /
                    [ Audit Events ]
                           |
                 [ Admin Human Review ]
```

## 4. Database collections

- `users`: name, normalized email, password hash, role, account status and creation time.
- `refresh_sessions`: hashed refresh-token identifier, user reference, expiry and creation time.
- `conversations`: user reference, question, AI answer, timestamp and review/override metadata.
- `audit_logs`: event name, user reference, limited event details, request IP and timestamp.

Use least-privilege MongoDB credentials. For stronger audit immutability, grant the application audit identity insert-only access to the audit collection and send security events to a separately controlled log platform.

## 5. AI and health-safety controls

PINACO must be presented as an educational information tool, not a diagnostic service.
The AI must not claim to diagnose, prescribe or replace a qualified clinician. Emergency
symptoms require immediate escalation to local emergency services or the nearest hospital.
AI output must be treated as untrusted content and rendered as text, not executable HTML.

Human review is represented by an administrator-only review endpoint. A production
deployment should add a dedicated review dashboard, clinician approval workflow,
reviewer identity verification, escalation queues and measurable safety monitoring.

## 6. Required pre-UAT tests

1. Register with valid and invalid inputs; duplicate email must be rejected.
2. Verify password hash is not equal to the submitted password.
3. Verify wrong passwords do not authenticate.
4. Verify access token expires after 15 minutes.
5. Verify refresh rotation invalidates the previous refresh token.
6. Verify logout revokes the refresh session.
7. Verify ordinary users cannot access administrator endpoints.
8. Verify disallowed origins are rejected.
9. Verify authentication and AI limits return HTTP 429 when exceeded.
10. Submit NoSQL injection payloads and confirm they cannot alter query behavior.
11. Submit XSS payloads and confirm they render as inert text.
12. Verify audit events are written for security-sensitive actions.
13. Verify a human reviewer can record approval, flagging or a correction.
14. Test AI emergency responses and unsafe medical requests with clinician-approved cases.
15. Run dependency, configuration, backup/restore, load and penetration tests.

## 7. Production deployment requirements

- HTTPS only; set `COOKIE_SECURE=true`.
- Use long, randomly generated secrets and a protected secret manager.
- Replace in-memory rate-limit storage with Redis for multi-worker deployments.
- Use a production WSGI server, not Flask debug/development mode.
- Restrict MongoDB network access and use least-privilege credentials.
- Add CSRF protections for any future cookie-authenticated state-changing browser routes.
- Implement account recovery, email verification, session/device management and incident response before public launch.
- Define health-data consent, retention, deletion and access procedures; obtain legal/privacy review for applicable Malawi requirements.
- Conduct clinician review and formal security testing before real-world health use.

## 8. Verification conclusion

The supplied code is a starting implementation, not evidence that all controls have passed.
The matrix statuses should be changed to PASSED only after test evidence, environment
configuration and deployment checks have been recorded. No claim of 100% security is made.
