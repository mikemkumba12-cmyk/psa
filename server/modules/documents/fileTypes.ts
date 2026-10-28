/**
 * Detects a file's real type from its first bytes. The browser-supplied MIME
 * type and file extension are not trusted.
 */
export interface DetectedType {
  mime: string;
  extension: string;
}

export const ACCEPTED_FORMATS_LABEL = 'PDF, JPG, PNG or WEBP';

export function detectFileType(data: Buffer): DetectedType | null {
  if (data.length < 12) return null;
  if (data.subarray(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', extension: 'pdf' };
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return { mime: 'image/jpeg', extension: 'jpg' };
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: 'image/png', extension: 'png' };
  }
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Strips path components and control characters from a user-supplied file name. */
export function safeFileName(name: string, extension: string): string {
  const base = name.split(/[\\/]/).pop() || 'document';
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 150) || 'document';
  return cleaned.toLowerCase().endsWith(`.${extension}`) ? cleaned : `${cleaned.replace(/\.[^.]*$/, '')}.${extension}`;
}
