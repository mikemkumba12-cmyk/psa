import { many, type Queryable, pool } from '../../db/pool';

export interface RequirementStatus {
  code: string;
  label: string;
  ownerScope: string;
  /** Best document found for this requirement, if any. */
  documentId: string | null;
  status: 'missing' | 'pending_review' | 'verified' | 'rejected' | 'expired';
}

/**
 * Resolves each document the product requires against documents attached to the
 * application, the business, and the applicant (in that order of preference).
 */
export async function documentRequirements(
  app: { id: string; customer_id: string | null; business_id: string | null; required_documents: string[] },
  client: Queryable = pool,
): Promise<RequirementStatus[]> {
  if (!app.required_documents.length) return [];
  const types = await many<{ code: string; label: string; owner_scope: string }>(
    'SELECT code, label, owner_scope FROM document_types WHERE code = ANY($1::text[])',
    [app.required_documents],
    client,
  );
  const docs = await many<{ id: string; document_type: string; status: string; expires_on: string | null; uploaded_at: Date }>(
    `SELECT id, document_type, status, expires_on, uploaded_at FROM documents
      WHERE deleted_at IS NULL AND status <> 'replaced' AND document_type = ANY($1::text[])
        AND (application_id = $2 OR ($3::text IS NOT NULL AND business_id = $3) OR ($4::text IS NOT NULL AND customer_id = $4))`,
    [app.required_documents, app.id, app.business_id, app.customer_id],
    client,
  );
  const today = new Date().toISOString().slice(0, 10);
  const rank = (status: RequirementStatus['status']) => ({ verified: 4, pending_review: 3, rejected: 2, expired: 1, missing: 0 }[status]);

  return app.required_documents.map(code => {
    const type = types.find(item => item.code === code);
    let best: { id: string; status: RequirementStatus['status'] } | null = null;
    for (const doc of docs.filter(item => item.document_type === code)) {
      const status: RequirementStatus['status'] = doc.expires_on && doc.expires_on < today ? 'expired' : (doc.status as RequirementStatus['status']);
      if (!best || rank(status) > rank(best.status)) best = { id: doc.id, status };
    }
    return {
      code,
      label: type?.label ?? code,
      ownerScope: type?.owner_scope ?? 'any',
      documentId: best?.id ?? null,
      status: best?.status ?? 'missing',
    };
  });
}

/** Requirements that block submission: nothing usable has been uploaded. */
export function blockingForSubmission(requirements: RequirementStatus[]): RequirementStatus[] {
  return requirements.filter(item => item.status === 'missing' || item.status === 'rejected' || item.status === 'expired');
}

/** Requirements that block approval: not yet verified by staff. */
export function blockingForApproval(requirements: RequirementStatus[]): RequirementStatus[] {
  return requirements.filter(item => item.status !== 'verified');
}
