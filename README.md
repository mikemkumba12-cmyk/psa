# PINACO Smart Advisor — Flask Security Starter

A Flask + MongoDB health-information advisor starter with registration, login,
short-lived JWT access tokens, rotating refresh tokens in HTTP-only cookies,
role checks, rate limits, audit events, conversation history and an optional
OpenAI Responses API connection.

## 1. Requirements
- Python 3.10+
- MongoDB Community Server or a MongoDB Atlas database
- An OpenAI API key for live AI responses (optional until chat is used)

## 2. Install on Windows PowerShell
```powershell
cd path\to\PINACO_Smart_Advisor
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install --upgrade pip
py -m pip install -r requirements.txt
Copy-Item .env.example .env
```
If `py` is not recognised, install Python 3.11 or newer from python.org,
select "Add Python to PATH", reopen PowerShell and repeat the commands.

## 3. Configure
Edit `.env`:
- Set unique random `SECRET_KEY` and `JWT_SECRET_KEY` values.
- Set `MONGO_URI` and `MONGO_DB_NAME`.
- Set `APP_URL` and `ALLOWED_ORIGINS` to the actual website origin.
- Set `OPENAI_API_KEY` if you want live AI chat.
- For HTTPS production, set `COOKIE_SECURE=true`.

Do not commit `.env` to GitHub. The provided `.gitignore` excludes it.

## 4. Run locally
Start MongoDB, then:
```powershell
py app.py
```
Open http://127.0.0.1:5000

## 5. First administrator
Registration deliberately creates ordinary `user` accounts only. Promote an
administrator manually using a trusted MongoDB administration session:
```javascript
db.users.updateOne(
  { email: "your-admin-email@example.com" },
  { $set: { role: "admin" } }
)
```
Never expose an admin-registration endpoint publicly.

## 6. Run tests
```powershell
py -m pytest -q
```

## 7. Production checklist
- Deploy behind HTTPS using a production WSGI server (for example Gunicorn
  on Linux or Waitress on Windows); do not use Flask's development server.
- Set `COOKIE_SECURE=true`; use strong independent secrets.
- Use a dedicated MongoDB application account with least-privilege permissions.
- Restrict network access to MongoDB; enable backups and encryption at rest.
- Use shared Redis storage for Flask-Limiter across multiple app instances.
- Configure trusted proxy handling carefully; never trust arbitrary forwarded IPs.
- Add monitoring, alerting, dependency scanning, backup-restore tests and
  an incident-response process.
- Have qualified clinicians review health content and emergency guidance.
- Confirm privacy, consent, retention and applicable Malawi data-protection
  requirements before collecting real health information.

## 8. Important limitations
This is a secure starter, not a certification or completed production audit.
The included test is a small unit test. Full integration, penetration,
concurrency, deployment and clinician-safety testing remain necessary.
