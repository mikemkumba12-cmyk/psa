/**
 * Backup: database dump + document files, into a timestamped folder.
 *
 *   npm run backup
 *
 * Requires pg_dump on PATH (or PG_DUMP_PATH). The backup is verified by checking
 * that the dump is non-empty and that every stored document referenced by the
 * database exists in the copied files. Restore steps are in BACKUP_AND_RECOVERY.md.
 */
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../server/config';
import { many, pool } from '../server/db/pool';

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(config.backups.dir, stamp);
  await fs.mkdir(target, { recursive: true });

  const dumpFile = path.join(target, 'database.dump');
  const dump = spawnSync(config.backups.pgDumpPath, ['--format=custom', '--no-owner', `--file=${dumpFile}`, config.database.url], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (dump.status !== 0) throw new Error('pg_dump failed. Set PG_DUMP_PATH if pg_dump is not on PATH.');
  const dumpSize = (await fs.stat(dumpFile)).size;
  if (dumpSize === 0) throw new Error('pg_dump produced an empty file.');

  const filesTarget = path.join(target, 'documents');
  await fs.cp(config.documents.localDir, filesTarget, { recursive: true }).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });

  const keys = await many<{ storage_key: string }>('SELECT storage_key FROM documents WHERE storage_key IS NOT NULL');
  const missing: string[] = [];
  for (const { storage_key } of keys) {
    try { await fs.access(path.join(filesTarget, storage_key)); } catch { missing.push(storage_key); }
  }
  await fs.writeFile(path.join(target, 'manifest.json'), JSON.stringify({
    createdAt: new Date().toISOString(), databaseDumpBytes: dumpSize, documentsReferenced: keys.length, documentsMissing: missing.length,
    encryptedDocuments: Boolean(config.documents.encryptionKey),
  }, null, 2));
  console.log(`Backup written to ${target} (${(dumpSize / 1024).toFixed(0)} KB dump, ${keys.length} documents).`);
  if (missing.length) {
    console.error(`WARNING: ${missing.length} document file(s) referenced in the database were not found in storage.`);
    process.exitCode = 2;
  }
}

main().catch(error => { console.error(`[backup] ${error.message}`); process.exitCode = 1; }).finally(() => pool.end());
