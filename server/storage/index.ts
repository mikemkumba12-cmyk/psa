import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';

/**
 * Private document storage.
 *
 * The database stores only a storage key; file bytes live behind this
 * interface. Files are never placed in a web-served directory and are only
 * returned through authenticated API routes.
 *
 * Only the local filesystem driver exists today. An object-storage driver
 * (e.g. S3-compatible) can implement the same interface when hosting is chosen;
 * see DOCUMENT_STORAGE.md for the migration procedure.
 */
export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

class LocalFileDriver implements StorageDriver {
  readonly name = 'local';

  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!/^[a-zA-Z0-9/_-]+$/.test(key)) throw new Error('Invalid storage key.');
    const fullPath = path.resolve(this.root, key);
    if (!fullPath.startsWith(path.resolve(this.root) + path.sep)) throw new Error('Storage key escapes the storage root.');
    return fullPath;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${crypto.randomBytes(6).toString('hex')}.tmp`;
    await fs.writeFile(temp, data, { mode: 0o600 });
    await fs.rename(temp, target);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }
}

// ── Optional encryption at rest (AES-256-GCM) ────────────────────────────────

const MAGIC = Buffer.from('PFSE1');

function encryptionKey(): Buffer | null {
  if (!config.documents.encryptionKey) return null;
  const key = Buffer.from(config.documents.encryptionKey, 'base64');
  if (key.length !== 32) throw new Error('DOCUMENT_ENCRYPTION_KEY must be 32 bytes encoded as base64.');
  return key;
}

export function encryptionEnabled(): boolean {
  return encryptionKey() !== null;
}

export function encrypt(data: Buffer): Buffer {
  const key = encryptionKey();
  if (!key) return data;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decrypt(stored: Buffer, wasEncrypted: boolean): Buffer {
  if (!wasEncrypted) return stored;
  const key = encryptionKey();
  if (!key) throw new Error('This document is encrypted but DOCUMENT_ENCRYPTION_KEY is not configured.');
  if (!stored.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Encrypted document has an unknown format.');
  const iv = stored.subarray(5, 17);
  const tag = stored.subarray(17, 33);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(stored.subarray(33)), decipher.final()]);
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  if (driver) return driver;
  if (config.documents.driver !== 'local') {
    throw new Error(`Document storage driver "${config.documents.driver}" is not implemented. Use "local".`);
  }
  driver = new LocalFileDriver(config.documents.localDir);
  return driver;
}

/** Storage keys are random and carry no customer information. */
export function newStorageKey(): string {
  const now = new Date();
  const month = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${month}/${crypto.randomUUID().replace(/-/g, '')}`;
}
