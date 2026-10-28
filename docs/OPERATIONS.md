# Operations

## Deployment

The repository ships a single-server Docker deployment (`docker-compose.yml`): the API (which also serves the built web app) and PostgreSQL.

1. Create `.env` next to `docker-compose.yml` with at least:
   - `POSTGRES_PASSWORD` — strong random value
   - `AUTH_SECRET` — 32+ random characters (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`)
   - `APP_URL` — the public origin(s), comma-separated
   - `WEBAUTHN_RP_ID` (the domain, e.g. `portal.example.mw`) and `WEBAUTHN_ORIGINS` (e.g. `https://portal.example.mw`) for passkeys
   - `TRUST_PROXY=true` when behind a reverse proxy / load balancer
   - Optional: `DOCUMENT_ENCRYPTION_KEY`, `SENDGRID_*`, `AFRICASTALKING_*`, `ASSISTANT_OLLAMA_*`
2. `docker compose up -d --build`. Migrations run on start (`MIGRATE_ON_START=true`).
3. Put HTTPS in front (e.g. Caddy or Nginx). Passkeys require HTTPS outside `localhost`.
4. Create the first administrator: `docker compose exec app npm run create-admin -- "Full Name" admin@example.mw`. A one-time password is printed and must be changed at first sign-in. Never run `seed:demo` on production.

The API refuses to start in production without `AUTH_SECRET`, and refuses to start anywhere if migrations are pending (unless `MIGRATE_ON_START=true`).

**Scaling:** run one API instance. The rate limiter and background jobs are in-process; a shared store is needed before running several instances.

## Document storage

- Files are written by `server/storage` to `DOCUMENT_STORAGE_DIR` (default `.local/documents`, `/app/storage/documents` in Docker). This directory is **not** served by the web server; files are only returned by `GET /api/documents/:id/content` after authentication and record-level authorisation, and every view/download is audited.
- Storage keys are random (`YYYY/MM/<uuid>`) and contain no customer data. The database stores metadata, a SHA-256 checksum (verified on every read) and the storage key.
- Accepted: PDF, JPEG, PNG, WEBP, detected from file content (not the extension); size limit `DOCUMENT_MAX_BYTES` (default 10 MB).
- **Encryption at rest** is optional: set `DOCUMENT_ENCRYPTION_KEY` (32 random bytes, base64). Files are then sealed with AES-256-GCM. The `encrypted` flag is stored per document, so existing unencrypted files remain readable. **Back up the key separately**; without it encrypted files cannot be read. Encryption is *not* enabled by default and should not be described as enabled unless this variable is set.
- Deletion is soft (status `deleted`, reason recorded); files are kept until the institution defines a retention period. A purge job is not implemented.

### Moving storage to another server or to object storage

1. Stop the API (or put it in maintenance).
2. Copy the storage directory preserving relative paths (`rsync -a old/ new/`).
3. Point `DOCUMENT_STORAGE_DIR` at the new location and start the API.
4. Verify with `npm run backup` — the manifest reports any database-referenced files that are missing.

An S3-compatible driver can implement the `StorageDriver` interface in `server/storage/index.ts` (put/get/remove/exists); migration is then a copy of each object under the same key plus a change of `DOCUMENT_STORAGE_DRIVER`.

## Backups

`npm run backup` writes `BACKUP_DIR/<timestamp>/` containing:

- `database.dump` — `pg_dump --format=custom`
- `documents/` — a copy of the storage directory
- `manifest.json` — sizes, document counts, and the number of database-referenced files missing from storage (non-zero exit code if any are missing)

Schedule it (cron / Task Scheduler) and copy the folder off the server. The database and the files must be backed up together; a dump without the files (or vice versa) is incomplete.

### Restore

```bash
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" BACKUP_DIR/<timestamp>/database.dump
rsync -a BACKUP_DIR/<timestamp>/documents/ "$DOCUMENT_STORAGE_DIR"/
npm run migrate   # applies any migrations newer than the backup
```

If documents were encrypted, the same `DOCUMENT_ENCRYPTION_KEY` must be configured.

Verified locally (2026-10-25): `npm run backup` against the development database, then `pg_restore` into an empty database — row counts for applications, documents, audit events and migrations matched the source, and the manifest reported 0 missing files. A restore drill on the target infrastructure has not been performed and should be before go-live.

## Monitoring

- `GET /api/health` returns 503 when the database is unreachable.
- Staff portal → Reports → Data quality lists consistency checks (unconfirmed transactions older than 3 days, documents awaiting review over 7 days, expired verified documents, demo records present, …).
- Staff portal → Assistant knowledge shows assistant usage, unanswered questions and errors for the last 30 days.
- The audit log (Staff portal → Audit log) is append-only at the database level.
