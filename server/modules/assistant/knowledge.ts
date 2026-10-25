import { Router } from 'express';
import { z } from 'zod';
import { many, one, transaction, type Queryable, pool } from '../../db/pool';
import { audit } from '../../lib/audit';
import { badRequest, conflict, forbidden, notFound, parse, route } from '../../lib/http';
import { newId } from '../../lib/ids';
import { requirePermission } from '../../auth/permissions';

/**
 * Knowledge ingestion pipeline:
 *   1. A staff member with knowledge.manage adds a document (Markdown text) with its source.
 *   2. It is split into chunks at headings / paragraphs (≈ 900 characters max).
 *   3. Chunks are indexed with PostgreSQL full-text search (generated tsvector + GIN index).
 *   4. Only APPROVED documents are searchable, and staff-only documents never reach customers.
 * Approval must be given by someone other than the author.
 */

const MAX_CHUNK = 900;

export function chunkMarkdown(body: string): Array<{ heading: string | null; content: string }> {
  const chunks: Array<{ heading: string | null; content: string }> = [];
  let heading: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) {
      // Split oversized sections at paragraph boundaries.
      let current = '';
      for (const paragraph of text.split(/\n{2,}/)) {
        if ((current + '\n\n' + paragraph).length > MAX_CHUNK && current) {
          chunks.push({ heading, content: current.trim() });
          current = paragraph;
        } else {
          current = current ? `${current}\n\n${paragraph}` : paragraph;
        }
      }
      if (current.trim()) chunks.push({ heading, content: current.trim() });
    }
    buffer = [];
  };
  for (const line of body.replace(/\r\n/g, '\n').split('\n')) {
    const match = /^#{1,4}\s+(.*)$/.exec(line);
    if (match) {
      flush();
      heading = match[1].trim().slice(0, 255);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return chunks;
}

export async function rebuildChunks(documentId: string, body: string, client: Queryable = pool): Promise<number> {
  await client.query('DELETE FROM kb_chunks WHERE document_id = $1', [documentId]);
  const chunks = chunkMarkdown(body);
  for (const [position, chunk] of chunks.entries()) {
    await client.query('INSERT INTO kb_chunks (id, document_id, position, heading, content) VALUES ($1, $2, $3, $4, $5)',
      [newId('kbc'), documentId, position, chunk.heading, chunk.content]);
  }
  return chunks.length;
}

/** Indexes approved documents that were inserted directly (e.g. by a migration) without chunks. */
export async function ensureKnowledgeIndexed(): Promise<void> {
  const missing = await many<{ id: string; body: string }>(
    `SELECT d.id, d.body FROM kb_documents d WHERE NOT EXISTS (SELECT 1 FROM kb_chunks c WHERE c.document_id = d.id)`,
  );
  for (const doc of missing) await rebuildChunks(doc.id, doc.body);
}

export interface KnowledgeHit {
  documentId: string;
  title: string;
  sourceReference: string | null;
  heading: string | null;
  content: string;
  rank: number;
}

export async function searchKnowledge(question: string, audience: 'public' | 'staff', limit = 3): Promise<KnowledgeHit[]> {
  const rows = await many(
    `WITH q AS (SELECT websearch_to_tsquery('english', $1) AS query)
     SELECT c.document_id, d.title, d.source_reference, c.heading, c.content,
            ts_rank_cd(c.search_vector, q.query) AS rank
       FROM kb_chunks c JOIN kb_documents d ON d.id = c.document_id, q
      WHERE d.status = 'approved' AND c.search_vector @@ q.query
        AND ($2::text = 'staff' OR d.visibility = 'public')
      ORDER BY rank DESC LIMIT $3`,
    [question, audience, limit],
  );
  // Fall back to an OR query when the strict AND query finds nothing, but require the passage to
  // share several distinct terms with the question so one common word ("capital") is not enough.
  if (!rows.length) {
    const terms = [...new Set(question.toLowerCase().match(/[a-z]{4,}/g)?.filter(term => !STOP_WORDS.has(term)) ?? [])].slice(0, 12);
    if (!terms.length) return [];
    const needed = terms.length <= 2 ? terms.length : Math.max(2, Math.ceil(terms.length / 2));
    const matchedTerms = terms.map((_, index) => `(c.search_vector @@ plainto_tsquery('english', $${index + 4}))::int`).join(' + ');
    const loose = await many(
      `WITH q AS (SELECT to_tsquery('english', $1) AS query)
       SELECT * FROM (
         SELECT c.document_id, d.title, d.source_reference, c.heading, c.content, ts_rank_cd(c.search_vector, q.query) AS rank,
                (${matchedTerms}) AS matched
           FROM kb_chunks c JOIN kb_documents d ON d.id = c.document_id, q
          WHERE d.status = 'approved' AND c.search_vector @@ q.query AND ($2::text = 'staff' OR d.visibility = 'public')
       ) scored
       WHERE matched >= ${needed}
       ORDER BY matched DESC, rank DESC LIMIT $3`,
      [terms.join(' | '), audience, limit, ...terms],
    );
    return loose.map(toHit);
  }
  return rows.map(toHit);
}

function toHit(row: any): KnowledgeHit {
  return { documentId: row.document_id, title: row.title, sourceReference: row.source_reference, heading: row.heading, content: row.content, rank: Number(row.rank) };
}

const STOP_WORDS = new Set(['what', 'when', 'where', 'which', 'with', 'would', 'could', 'should', 'have', 'does', 'your', 'from', 'that', 'this', 'about', 'there', 'their', 'need', 'want', 'much', 'many', 'please', 'tell', 'know']);

// ── Administration ───────────────────────────────────────────────────────────

export const knowledgeRouter = Router();

const docSchema = z.object({
  title: z.string().trim().min(3).max(255),
  sourceType: z.enum(['institution_policy', 'product_information', 'faq', 'public_website', 'financial_education']),
  sourceReference: z.string().trim().max(500).optional().nullable(),
  visibility: z.enum(['public', 'staff']),
  body: z.string().trim().min(20).max(100_000),
});

function presentDoc(row: any) {
  return {
    id: row.id, title: row.title, sourceType: row.source_type, sourceReference: row.source_reference, visibility: row.visibility,
    status: row.status, body: row.body, version: row.version, createdBy: row.creator_name ?? null, approvedBy: row.approver_name ?? null,
    approvedAt: row.approved_at, updatedAt: row.updated_at, chunkCount: row.chunk_count ?? undefined,
  };
}

const DOC_SELECT = `SELECT d.*, cu.name AS creator_name, au.name AS approver_name,
  (SELECT count(*)::int FROM kb_chunks c WHERE c.document_id = d.id) AS chunk_count
  FROM kb_documents d LEFT JOIN users cu ON cu.id = d.created_by LEFT JOIN users au ON au.id = d.approved_by`;

knowledgeRouter.get('/knowledge', requirePermission('knowledge.manage'), route(async (_req, res) => {
  res.json((await many(`${DOC_SELECT} ORDER BY d.status, d.title`)).map(presentDoc));
}));

knowledgeRouter.post('/knowledge', requirePermission('knowledge.manage'), route(async (req, res) => {
  const input = parse(docSchema, req.body);
  const id = newId('kb');
  await transaction(async client => {
    await client.query(
      `INSERT INTO kb_documents (id, title, source_type, source_reference, visibility, status, body, created_by) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7)`,
      [id, input.title, input.sourceType, input.sourceReference ?? null, input.visibility, input.body, req.auth!.userId],
    );
    await rebuildChunks(id, input.body, client);
    await audit(req, { action: 'knowledge.create', entityType: 'kb_document', entityId: id, summary: `Added knowledge document "${input.title}" (draft).` }, client);
  });
  res.status(201).json(presentDoc(await one(`${DOC_SELECT} WHERE d.id = $1`, [id])));
}));

knowledgeRouter.put('/knowledge/:id', requirePermission('knowledge.manage'), route(async (req, res) => {
  const input = parse(docSchema, req.body);
  const existing = await one('SELECT id, status FROM kb_documents WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound('Document not found.');
  await transaction(async client => {
    // Any edit returns the document to draft so the new wording must be approved again.
    await client.query(
      `UPDATE kb_documents SET title = $2, source_type = $3, source_reference = $4, visibility = $5, body = $6, status = 'draft',
              version = version + 1, approved_by = NULL, approved_at = NULL, created_by = $7, updated_at = now()
        WHERE id = $1`,
      [existing.id, input.title, input.sourceType, input.sourceReference ?? null, input.visibility, input.body, req.auth!.userId],
    );
    await rebuildChunks(existing.id, input.body, client);
    await audit(req, { action: 'knowledge.update', entityType: 'kb_document', entityId: existing.id, summary: `Edited knowledge document "${input.title}"; re-approval required.` }, client);
  });
  res.json(presentDoc(await one(`${DOC_SELECT} WHERE d.id = $1`, [existing.id])));
}));

knowledgeRouter.post('/knowledge/:id/status', requirePermission('knowledge.manage'), route(async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(['approved', 'retired', 'draft']) }), req.body);
  const doc = await one('SELECT id, title, created_by, status FROM kb_documents WHERE id = $1', [req.params.id]);
  if (!doc) throw notFound('Document not found.');
  if (status === 'approved' && doc.created_by === req.auth!.userId) throw forbidden('Another person must approve knowledge you wrote.');
  if (doc.status === status) throw conflict(`Already ${status}.`);
  if (status === 'approved') {
    const chunks = await one<{ n: number }>('SELECT count(*)::int AS n FROM kb_chunks WHERE document_id = $1', [doc.id]);
    if (!chunks?.n) throw badRequest('This document has no searchable content.');
  }
  await transaction(async client => {
    await client.query(
      `UPDATE kb_documents SET status = $2::text, approved_by = CASE WHEN $2::text = 'approved' THEN $3 ELSE approved_by END,
              approved_at = CASE WHEN $2::text = 'approved' THEN now() ELSE approved_at END, updated_at = now() WHERE id = $1`,
      [doc.id, status, req.auth!.userId],
    );
    await audit(req, { action: `knowledge.${status}`, entityType: 'kb_document', entityId: doc.id, summary: `Set "${doc.title}" to ${status}.` }, client);
  });
  res.json(presentDoc(await one(`${DOC_SELECT} WHERE d.id = $1`, [doc.id])));
}));
