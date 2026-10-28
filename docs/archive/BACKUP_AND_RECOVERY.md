# PINACO Smart Advisor — Backup & Disaster Recovery Guide

---

## 1. PostgreSQL Database Backups

### Automated Daily Dump (cron script)
Create `/usr/local/bin/backup_pinaco_db.sh`:

```bash
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/pinaco"
mkdir -p $BACKUP_DIR

pg_dump -U postgres -h localhost -d pinaco -F c -b -v -f "$BACKUP_DIR/pinaco_db_$TIMESTAMP.dump"

# Retain last 30 days
find $BACKUP_DIR -type f -name "*.dump" -mtime +30 -delete
```

### Point-in-Time Database Restoration
```bash
pg_restore -U postgres -h localhost -d pinaco --clean --if-exists /var/backups/pinaco/pinaco_db_YYYYMMDD_HHMMSS.dump
```

---

## 2. File-Store (Dual-Mode Fallback) Backups

In non-PostgreSQL demo mode, data is safely stored at `server/data/mock_database.json`.

### Manual Backup
```bash
cp server/data/mock_database.json server/data/mock_database_backup_$(date +%F).json
```
