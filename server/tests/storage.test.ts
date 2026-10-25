import './env';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { config } from '../config';
import { decrypt, encrypt, encryptionEnabled } from '../storage';

describe('encryption at rest', () => {
  it('round-trips with AES-256-GCM and detects tampering', () => {
    const original = config.documents.encryptionKey;
    config.documents.encryptionKey = crypto.randomBytes(32).toString('base64');
    try {
      assert.equal(encryptionEnabled(), true);
      const data = Buffer.from('%PDF-1.4 confidential national id scan');
      const sealed = encrypt(data);
      assert.ok(!sealed.includes(Buffer.from('confidential')), 'ciphertext does not contain the plaintext');
      assert.deepEqual(decrypt(sealed, true), data);
      sealed[sealed.length - 1] ^= 0xff;
      assert.throws(() => decrypt(sealed, true));
    } finally {
      config.documents.encryptionKey = original;
    }
  });

  it('refuses to read encrypted files when the key is missing', () => {
    const original = config.documents.encryptionKey;
    config.documents.encryptionKey = '';
    try {
      assert.throws(() => decrypt(Buffer.from('PFSE1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true), /not configured/);
    } finally {
      config.documents.encryptionKey = original;
    }
  });
});
