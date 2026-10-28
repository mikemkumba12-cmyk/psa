import { Router, type Request } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../../config';
import { many, one, transaction } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, forbidden, notFound, parse, route, unprocessable } from '../../lib/http';
import { newId, sha256Hex } from '../../lib/ids';
import { assertApplicationAccess, assertBusinessAccess, assertCustomerAccess } from '../../auth/access';
import { assertPermission } from '../../auth/permissions';
import { decrypt, encrypt, encryptionEnabled, newStorageKey, storage } from '../../storage';
import { ACCEPTED_FORMATS_LABEL, detectFileType, safeFileName } from './fileTypes';
import { notifyUser } from '../notifications/notify';

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.documents.maxBytes, files: 1, fields: 10 },
});

// Statuses during which an applicant may still add or change application documents.
const APPLICANT_EDITABLE_STATUSES = ['draft', 'submitted', 'under_review', 'info_requested', 'assessed', 'approved', 'offer_issued', 'offer_accepted'];

interface DocumentRow {
  id: string;
  document_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  storage_driver: string;
  storage_key: string;
  encrypted: boolean;
  status: string;
  customer_id: string | null;
  business_id: string | null;
  application_id: string | null;
  uploaded_by: string | null;
  uploaded_at: Date;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
  expires_on: string | null;
  replaces_document_id: string | null;
  deleted_at: Date | null;
}

const DOCUMENT_COLUMNS = `d.id, d.document_type, d.original_name, d.mime_type, d.size_bytes, d.sha256, d.storage_driver,
  d.storage_key, d.encrypted, d.status, d.customer_id, d.business_id, d.application_id, d.uploaded_by, d.uploaded_at,
  d.reviewed_by, d.reviewed_at, d.review_note, d.expires_on, d.replaces_document_id, d.deleted_at`;

function present(row: DocumentRow & { type_label?: string; uploader_name?: string; reviewer_name?: string }) {
  const expired = row.expires_on ? new Date(`${row.expires_on}T23:59:59Z`).getTime() < Date.now() : false;
  return {
    id: row.id,
    documentType: row.document_type,
    documentTypeLabel: row.type_label ?? row.document_type,
    fileName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    expired,
    customerId: row.customer_id,
    businessId: row.business_id,
    applicationId: row.application_id,
    uploadedBy: row.uploader_name ?? null,
    uploadedAt: row.uploaded_at,
    reviewedBy: row.reviewer_name ?? null,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    expiresOn: row.expires_on,
    replacesDocumentId: row.replaces_document_id,
  };
}

/** Confirms the caller may see (or change) every record the document belongs to. */
async function assertDocumentAccess(req: Request, doc: DocumentRow, mode: 'view' | 'review' | 'manage'): Promise<void> {
  const auth = req.auth!;
  if (doc.deleted_at && mode !== 'view') throw notFound('Document not found.');
  try {
    if (doc.application_id) await assertApplicationAccess(req, doc.application_id);
    if (doc.business_id) await assertBusinessAccess(req, doc.business_id, mode === 'manage' && auth.role === 'customer' ? 'manage' : 'view');
    if (doc.customer_id) await assertCustomerAccess(req, doc.customer_id);
  } catch {
    throw notFound('Document not found.');
  }
  if (auth.isStaff) {
    if (mode === 'view') assertPermission(req, 'documents.view');
    if (mode === 'review') assertPermission(req, 'documents.verify');
  } else if (mode === 'review') {
    throw forbidden();
  }
}

async function loadDocument(id: string): Promise<DocumentRow> {
  const doc = await one<DocumentRow>(`SELECT ${DOCUMENT_COLUMNS} FROM documents d WHERE d.id = $1`, [id]);
  if (!doc || doc.deleted_at) throw notFound('Document not found.');
  return doc;
}

// ── Document types ───────────────────────────────────────────────────────────

documentsRouter.get('/document-types', route(async (_req, res) => {
  const types = await many(
    'SELECT code, label, owner_scope, has_expiry, description FROM document_types WHERE is_active ORDER BY sort_order',
  );
  res.json({
    types: types.map(type => ({
      code: type.code, label: type.label, ownerScope: type.owner_scope, hasExpiry: type.has_expiry, description: type.description,
    })),
    maxBytes: config.documents.maxBytes,
    acceptedFormats: ACCEPTED_FORMATS_LABEL,
    acceptedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  });
}));

// ── Upload ───────────────────────────────────────────────────────────────────

const uploadSchema = z.object({
  documentType: z.string().trim().min(1).max(50),
  customerId: z.string().trim().max(100).optional(),
  businessId: z.string().trim().max(100).optional(),
  applicationId: z.string().trim().max(100).optional(),
  expiresOn: z.iso.date().optional(),
  replacesDocumentId: z.string().trim().max(100).optional(),
});

documentsRouter.post('/documents', upload.single('file'), route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(uploadSchema, req.body);
  const file = req.file;
  if (!file) throw badRequest('Choose a file to upload.', [{ field: 'file', message: 'A file is required.' }]);
  if (file.size === 0) throw badRequest('The file is empty.', [{ field: 'file', message: 'The file is empty.' }]);

  const detected = detectFileType(file.buffer);
  if (!detected) {
    throw unprocessable(`This file type is not accepted. Upload a ${ACCEPTED_FORMATS_LABEL} file.`, [{ field: 'file', message: 'Unsupported file type.' }]);
  }

  const type = await one('SELECT code, label, owner_scope, has_expiry FROM document_types WHERE code = $1 AND is_active', [input.documentType]);
  if (!type) throw badRequest('Unknown document type.', [{ field: 'documentType', message: 'Unknown document type.' }]);

  // Customers upload for themselves unless a business or application is named.
  let customerId = input.customerId ?? null;
  if (auth.role === 'customer' && !customerId && !input.businessId && !input.applicationId) customerId = auth.customerId;
  if (!customerId && !input.businessId && !input.applicationId) {
    throw badRequest('Say which customer, business or application this document belongs to.');
  }
  if (type.owner_scope === 'customer' && !customerId) throw badRequest(`${type.label} must be attached to a person.`);
  if (type.owner_scope === 'business' && !input.businessId) throw badRequest(`${type.label} must be attached to a business.`);
  if (type.owner_scope === 'application' && !input.applicationId) throw badRequest(`${type.label} must be attached to an application.`);

  // Authorization for every owner the document will be linked to.
  if (customerId) {
    await assertCustomerAccess(req, customerId);
    if (auth.isStaff) assertPermission(req, 'customers.manage');
  }
  if (input.businessId) await assertBusinessAccess(req, input.businessId, 'manage');
  if (input.applicationId) {
    const app = await assertApplicationAccess(req, input.applicationId);
    if (auth.role === 'customer' && !APPLICANT_EDITABLE_STATUSES.includes(app.status)) {
      throw forbidden('Documents can no longer be added to this application.');
    }
    if (auth.isStaff && !auth.permissions.has('applications.assess') && !auth.permissions.has('offers.prepare')) {
      assertPermission(req, 'applications.assess');
    }
  }

  let replaced: DocumentRow | null = null;
  if (input.replacesDocumentId) {
    replaced = await loadDocument(input.replacesDocumentId);
    await assertDocumentAccess(req, replaced, 'manage');
    if (replaced.document_type !== input.documentType) throw badRequest('A replacement must be the same document type.');
  }

  const id = newId('doc');
  const storageKey = newStorageKey();
  const fileName = safeFileName(file.originalname, detected.extension);
  const encrypted = encryptionEnabled();
  await storage().put(storageKey, encrypt(file.buffer));

  try {
    await transaction(async client => {
      await client.query(
        `INSERT INTO documents (id, uploaded_by, original_name, document_type, size_bytes, mime_type, sha256, storage_driver,
                                storage_key, encrypted, status, customer_id, business_id, application_id, expires_on, replaces_document_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending_review', $11, $12, $13, $14, $15)`,
        [id, auth.userId, fileName, input.documentType, file.size, detected.mime, sha256Hex(file.buffer), storage().name,
          storageKey, encrypted, customerId, input.businessId ?? null, input.applicationId ?? null, input.expiresOn ?? null,
          replaced?.id ?? null],
      );
      if (replaced) {
        await client.query(`UPDATE documents SET status = 'replaced' WHERE id = $1`, [replaced.id]);
      }
      await audit(req, {
        action: replaced ? 'document.replace' : 'document.upload',
        entityType: 'document',
        entityId: id,
        summary: `${replaced ? 'Replaced' : 'Uploaded'} ${type.label}.`,
        metadata: {
          documentType: input.documentType, sizeBytes: file.size, mimeType: detected.mime,
          customerId, businessId: input.businessId, applicationId: input.applicationId, replaces: replaced?.id,
        },
      }, client);
    });
  } catch (error) {
    // Keep storage and database consistent: no orphaned files.
    await storage().remove(storageKey).catch(() => undefined);
    throw error;
  }

  const saved = await one(
    `SELECT ${DOCUMENT_COLUMNS}, t.label AS type_label, u.name AS uploader_name
       FROM documents d JOIN document_types t ON t.code = d.document_type LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE d.id = $1`,
    [id],
  );
  res.status(201).json(present(saved));
}));

// ── List ─────────────────────────────────────────────────────────────────────

const listSchema = z.object({
  customerId: z.string().optional(),
  businessId: z.string().optional(),
  applicationId: z.string().optional(),
  includeHistory: z.enum(['true', 'false']).optional(),
});

documentsRouter.get('/documents', route(async (req, res) => {
  const auth = req.auth!;
  const input = parse(listSchema, req.query);
  let customerId = input.customerId;
  if (auth.role === 'customer' && !customerId && !input.businessId && !input.applicationId) customerId = auth.customerId ?? undefined;
  if (!customerId && !input.businessId && !input.applicationId) throw badRequest('Filter by customerId, businessId or applicationId.');

  if (customerId) await assertCustomerAccess(req, customerId);
  if (input.businessId) await assertBusinessAccess(req, input.businessId, 'view');
  if (input.applicationId) await assertApplicationAccess(req, input.applicationId);
  if (auth.isStaff) assertPermission(req, 'documents.view');

  const conditions = ['d.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (customerId) { params.push(customerId); conditions.push(`d.customer_id = $${params.length}`); }
  if (input.businessId) { params.push(input.businessId); conditions.push(`d.business_id = $${params.length}`); }
  if (input.applicationId) { params.push(input.applicationId); conditions.push(`d.application_id = $${params.length}`); }
  if (input.includeHistory !== 'true') conditions.push(`d.status <> 'replaced'`);

  const rows = await many(
    `SELECT ${DOCUMENT_COLUMNS}, t.label AS type_label, u.name AS uploader_name, r.name AS reviewer_name
       FROM documents d
       JOIN document_types t ON t.code = d.document_type
       LEFT JOIN users u ON u.id = d.uploaded_by
       LEFT JOIN users r ON r.id = d.reviewed_by
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.uploaded_at DESC`,
    params,
  );
  res.json(rows.map(present));
}));

// ── Content (preview / download) ─────────────────────────────────────────────

documentsRouter.get('/documents/:id/content', route(async (req, res) => {
  const doc = await loadDocument(req.params.id);
  await assertDocumentAccess(req, doc, 'view');
  const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';

  const stored = await storage().get(doc.storage_key);
  const data = decrypt(stored, doc.encrypted);
  if (sha256Hex(data) !== doc.sha256) {
    await audit(req, { action: 'document.integrity_failure', entityType: 'document', entityId: doc.id, outcome: 'failure', summary: 'Stored file does not match its recorded checksum.' });
    throw unprocessable('This document failed an integrity check. Contact an administrator.');
  }

  await audit(req, {
    action: disposition === 'attachment' ? 'document.download' : 'document.view',
    entityType: 'document',
    entityId: doc.id,
    summary: `${disposition === 'attachment' ? 'Downloaded' : 'Viewed'} document ${doc.original_name}.`,
  });

  res.setHeader('Content-Type', doc.mime_type);
  res.setHeader('Content-Length', String(data.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${doc.original_name.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox");
  res.end(data);
}));

// ── Review (verify / reject) ─────────────────────────────────────────────────

const reviewSchema = z.object({
  decision: z.enum(['verified', 'rejected']),
  note: z.string().trim().max(1000).optional(),
  expiresOn: z.iso.date().optional(),
});

documentsRouter.post('/documents/:id/review', route(async (req, res) => {
  const input = parse(reviewSchema, req.body);
  const doc = await loadDocument(req.params.id);
  await assertDocumentAccess(req, doc, 'review');
  if (doc.status === 'replaced') throw badRequest('This document has been replaced; review the newer version.');
  if (doc.uploaded_by === req.auth!.userId) throw forbidden('You cannot review a document you uploaded yourself.');
  if (input.decision === 'rejected' && !input.note) {
    throw badRequest('Give a reason so the customer knows what to fix.', [{ field: 'note', message: 'A reason is required when rejecting.' }]);
  }

  await transaction(async client => {
    await client.query(
      `UPDATE documents SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = now(),
              expires_on = COALESCE($5, expires_on)
        WHERE id = $1`,
      [doc.id, input.decision, input.note ?? null, req.auth!.userId, input.expiresOn ?? null],
    );
    await audit(req, {
      action: `document.${input.decision === 'verified' ? 'verify' : 'reject'}`,
      entityType: 'document',
      entityId: doc.id,
      summary: `${input.decision === 'verified' ? 'Verified' : 'Rejected'} ${doc.original_name}.`,
      metadata: { note: input.note, previousStatus: doc.status },
    }, client);
  });

  if (input.decision === 'rejected' && doc.uploaded_by) {
    await notifyUser(doc.uploaded_by, {
      type: 'warning',
      title: 'A document needs attention',
      body: `${doc.original_name} was not accepted: ${input.note}`,
      actionRoute: '/client/documents',
      entityType: 'document',
      entityId: doc.id,
    });
  }
  const updated = await one(
    `SELECT ${DOCUMENT_COLUMNS}, t.label AS type_label, u.name AS uploader_name, r.name AS reviewer_name
       FROM documents d JOIN document_types t ON t.code = d.document_type
       LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN users r ON r.id = d.reviewed_by
      WHERE d.id = $1`,
    [doc.id],
  );
  res.json(present(updated));
}));

// ── Delete (soft) ────────────────────────────────────────────────────────────

documentsRouter.delete('/documents/:id', route(async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(500) }), req.body ?? {});
  const auth = req.auth!;
  const doc = await loadDocument(req.params.id);
  await assertDocumentAccess(req, doc, 'manage');

  if (auth.role === 'customer') {
    if (doc.uploaded_by !== auth.userId) throw forbidden('You can only remove documents you uploaded.');
    if (doc.status === 'verified') throw forbidden('Verified documents cannot be removed. Upload a replacement instead.');
    if (doc.application_id) {
      const app = await one('SELECT status FROM loan_applications WHERE id = $1', [doc.application_id]);
      if (app && app.status !== 'draft' && app.status !== 'info_requested') {
        throw forbidden('This document is part of a submitted application. Upload a replacement instead.');
      }
    }
  } else {
    assertPermission(req, 'documents.delete');
  }

  // Soft delete: the file is retained until the institution's retention policy says it may be purged.
  await transaction(async client => {
    await client.query(
      `UPDATE documents SET status = 'deleted', deleted_at = now(), deleted_by = $2, delete_reason = $3 WHERE id = $1`,
      [doc.id, auth.userId, reason],
    );
    await audit(req, {
      action: 'document.delete', entityType: 'document', entityId: doc.id,
      summary: `Removed ${doc.original_name}.`, metadata: { reason, previousStatus: doc.status },
    }, client);
  });
  res.status(204).end();
}));
