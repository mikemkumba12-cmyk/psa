import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Eye, FileText, RefreshCw, Trash2, Upload, XCircle } from 'lucide-react';
import { api, ApiError, downloadFile, fetchFileUrl, uploadFile } from '../../api/client';
import type { DocumentTypesResponse, StoredDocument } from '../../api/types';
import { date, dateTime, fileSize } from '../../lib/format';
import { useResource } from '../../lib/useResource';
import { Button } from '../../ui/Button';
import { Alert, Badge, StatusBadge } from '../../ui/Feedback';
import { TextArea, TextInput } from '../../ui/Form';
import { ConfirmDialog, Modal } from '../../ui/Modal';
import { useToast } from '../../ui/Toast';

let typesCache: Promise<DocumentTypesResponse> | null = null;
export function useDocumentTypes() {
  const [data, setData] = useState<DocumentTypesResponse | null>(null);
  useEffect(() => {
    typesCache ??= api<DocumentTypesResponse>('/api/document-types');
    typesCache.then(setData).catch(() => { typesCache = null; });
  }, []);
  return data;
}

export interface DocumentOwner {
  customerId?: string;
  businessId?: string;
  applicationId?: string;
}

/**
 * Upload control. Validates type and size in the browser for quick feedback; the
 * server re-checks the real file content and size regardless.
 */
export function DocumentUploader({ documentType, owner, label, onUploaded, replacesDocumentId, compact, hasExpiry }: {
  documentType: string; owner: DocumentOwner; label?: string; onUploaded: (doc: StoredDocument) => void;
  replacesDocumentId?: string; compact?: boolean; hasExpiry?: boolean;
}) {
  const types = useDocumentTypes();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const type = types?.types.find(item => item.code === documentType);
  const showExpiry = hasExpiry ?? type?.hasExpiry;

  const choose = () => input.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file || !types) return;
    setError(null);
    if (!types.acceptedMimeTypes.includes(file.type)) {
      setError(`This file type is not accepted. Use ${types.acceptedFormats}.`);
      return;
    }
    if (file.size > types.maxBytes) {
      setError(`This file is ${fileSize(file.size)}. The limit is ${fileSize(types.maxBytes)}.`);
      return;
    }
    const form = new FormData();
    form.append('documentType', documentType);
    if (owner.customerId) form.append('customerId', owner.customerId);
    if (owner.businessId) form.append('businessId', owner.businessId);
    if (owner.applicationId) form.append('applicationId', owner.applicationId);
    if (replacesDocumentId) form.append('replacesDocumentId', replacesDocumentId);
    if (showExpiry && expiresOn) form.append('expiresOn', expiresOn);
    form.append('file', file);
    setProgress(0);
    try {
      const saved = await uploadFile<StoredDocument>('/api/documents', form, setProgress);
      onUploaded(saved);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The upload failed.');
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="min-w-0">
      <input ref={input} type="file" className="sr-only" tabIndex={-1} aria-hidden
        accept={types?.acceptedMimeTypes.join(',') ?? '.pdf,.jpg,.jpeg,.png,.webp'} onChange={event => onFile(event.target.files?.[0])} />
      {showExpiry && !compact && (
        <TextInput label="Expiry date (if shown on the document)" type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} fieldClassName="mb-3 max-w-xs" />
      )}
      {progress !== null ? (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="text-xs text-ink-muted">Uploading… {Math.round(progress * 100)}%</p>
        </div>
      ) : (
        <Button variant={compact ? 'secondary' : 'primary'} size={compact ? 'sm' : 'md'} onClick={choose} disabled={!types}
          icon={replacesDocumentId ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}>
          {label ?? (replacesDocumentId ? 'Replace' : `Upload ${type?.label.toLowerCase() ?? 'document'}`)}
        </Button>
      )}
      {!compact && types && progress === null && (
        <p className="mt-1.5 text-xs text-ink-muted">{types.acceptedFormats}, up to {fileSize(types.maxBytes)}.</p>
      )}
      {error && <p className="mt-1.5 text-xs font-medium text-danger-700" role="alert">{error}</p>}
    </div>
  );
}

function PreviewModal({ doc, onClose }: { doc: StoredDocument | null; onClose: () => void }) {
  const [state, setState] = useState<{ url: string; type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!doc) return;
    let url: string | null = null;
    setState(null);
    setError(null);
    fetchFileUrl(`/api/documents/${doc.id}/content`)
      .then(result => { url = result.url; setState(result); })
      .catch(caught => setError(caught instanceof ApiError ? caught.message : 'Could not open the document.'));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [doc]);
  return (
    <Modal open={Boolean(doc)} onClose={onClose} title={doc?.documentTypeLabel ?? ''} description={doc?.fileName} size="xl">
      {error && <Alert tone="danger">{error}</Alert>}
      {!state && !error && <p className="text-sm text-ink-muted">Opening…</p>}
      {state && (state.type.startsWith('image/')
        ? <img src={state.url} alt={doc?.documentTypeLabel} className="mx-auto max-h-[70dvh] max-w-full rounded-lg object-contain" />
        : <iframe title={doc?.fileName} src={state.url} className="h-[70dvh] w-full rounded-lg border border-line" sandbox="" />)}
    </Modal>
  );
}

function ReviewDialog({ doc, onClose, onDone }: { doc: StoredDocument | null; onClose: () => void; onDone: (doc: StoredDocument) => void }) {
  const [decision, setDecision] = useState<'verified' | 'rejected'>('verified');
  const [note, setNote] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setDecision('verified'); setNote(''); setExpiresOn(doc?.expiresOn ?? ''); setError(null); }, [doc]);
  const submit = async () => {
    if (!doc) return;
    setPending(true);
    setError(null);
    try {
      onDone(await api<StoredDocument>(`/api/documents/${doc.id}/review`, { body: { decision, note: note || undefined, expiresOn: expiresOn || undefined } }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not save the review.');
    } finally {
      setPending(false);
    }
  };
  return (
    <ConfirmDialog open={Boolean(doc)} onClose={onClose} title={`Review ${doc?.documentTypeLabel ?? 'document'}`} confirmLabel={decision === 'verified' ? 'Mark verified' : 'Reject document'}
      tone={decision === 'verified' ? 'success' : 'danger'} onConfirm={submit} pending={pending}>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-ink">Decision</legend>
        {(['verified', 'rejected'] as const).map(option => (
          <label key={option} className="flex items-center gap-2 text-sm">
            <input type="radio" name="decision" checked={decision === option} onChange={() => setDecision(option)} className="h-4 w-4 accent-brand-600" />
            {option === 'verified' ? 'Verified — the document is genuine and readable' : 'Rejected — the customer must provide a new one'}
          </label>
        ))}
      </fieldset>
      <div className="mt-4 space-y-3">
        <TextArea label={decision === 'rejected' ? 'Reason (shown to the customer)' : 'Note (optional)'} required={decision === 'rejected'} rows={3} value={note} onChange={event => setNote(event.target.value)} />
        <TextInput label="Expiry date" type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} hint="Record it if the document expires." />
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </ConfirmDialog>
  );
}

/** Lists documents for a customer, business or application with preview, download and (for staff) review. */
export function DocumentList({ owner, canReview, canManage, title, emptyText, requiredTypes }: {
  owner: DocumentOwner; canReview?: boolean; canManage?: boolean; title?: string; emptyText?: string; requiredTypes?: string[];
}) {
  const query = new URLSearchParams(Object.entries(owner).filter(([, value]) => value) as Array<[string, string]>).toString();
  const { data, error, loading, reload } = useResource<StoredDocument[]>(`/api/documents?${query}`);
  const types = useDocumentTypes();
  const toast = useToast();
  const [preview, setPreview] = useState<StoredDocument | null>(null);
  const [review, setReview] = useState<StoredDocument | null>(null);
  const [removing, setRemoving] = useState<StoredDocument | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [removePending, setRemovePending] = useState(false);
  const [addType, setAddType] = useState('');

  const scope = owner.applicationId ? ['application', 'any'] : owner.businessId ? ['business', 'any'] : ['customer', 'any'];
  const uploadable = types?.types.filter(type => scope.includes(type.ownerScope)) ?? [];
  const missingRequired = (requiredTypes ?? []).filter(code => !data?.some(doc => doc.documentType === code && doc.status !== 'rejected'));

  const remove = async () => {
    if (!removing) return;
    setRemovePending(true);
    try {
      await api(`/api/documents/${removing.id}`, { method: 'DELETE', body: { reason: removeReason || 'Removed by uploader' } });
      toast('Document removed.');
      setRemoving(null);
      setRemoveReason('');
      await reload();
    } catch (caught) {
      toast(caught instanceof ApiError ? caught.message : 'Could not remove the document.', 'error');
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <div className="min-w-0">
      {title && <h3 className="mb-3 text-sm font-semibold text-ink">{title}</h3>}
      {error && <Alert tone="danger">{error.message}</Alert>}
      {loading && !data && <p className="text-sm text-ink-muted">Loading documents…</p>}
      {data && data.length === 0 && <p className="text-sm text-ink-muted">{emptyText ?? 'No documents uploaded yet.'}</p>}
      {data && data.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.map(doc => (
            <li key={doc.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-ink-subtle" aria-hidden />
                <div className="min-w-0">
                  <p className="font-medium text-ink">{doc.documentTypeLabel}</p>
                  <p className="truncate text-xs text-ink-muted" title={doc.fileName}>{doc.fileName} · {fileSize(doc.sizeBytes)} · {date(doc.uploadedAt)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={doc.expired ? 'expired' : doc.status} />
                    {doc.expiresOn && <span className="text-xs text-ink-subtle">Expires {date(doc.expiresOn)}</span>}
                  </div>
                  {doc.status === 'rejected' && doc.reviewNote && <p className="mt-1 text-xs text-danger-700">Reason: {doc.reviewNote}</p>}
                  {doc.reviewedBy && <p className="mt-0.5 text-xs text-ink-subtle">Reviewed by {doc.reviewedBy}, {dateTime(doc.reviewedAt)}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 sm:justify-end">
                <Button size="sm" variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setPreview(doc)}>View</Button>
                <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} aria-label={`Download ${doc.fileName}`}
                  onClick={() => downloadFile(`/api/documents/${doc.id}/content?disposition=attachment`, doc.fileName).catch(caught => toast(caught.message, 'error'))}>
                  <span className="sm:sr-only">Download</span>
                </Button>
                {canReview && doc.status !== 'replaced' && (
                  <Button size="sm" variant={doc.status === 'pending_review' ? 'primary' : 'secondary'}
                    icon={doc.status === 'verified' ? <CheckCircle2 className="h-4 w-4" /> : doc.status === 'rejected' ? <XCircle className="h-4 w-4" /> : undefined}
                    onClick={() => setReview(doc)}>Review</Button>
                )}
                {canManage && (
                  <DocumentUploader compact documentType={doc.documentType} owner={owner} replacesDocumentId={doc.id}
                    onUploaded={() => { toast('Replacement uploaded.'); void reload(); }} />
                )}
                {canManage && doc.status !== 'verified' && (
                  <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={() => setRemoving(doc)} aria-label={`Remove ${doc.fileName}`}>
                    <span className="sm:sr-only">Remove</span>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && missingRequired.length > 0 && (
        <div className="mt-3 space-y-3 rounded-lg border border-dashed border-line-strong p-3">
          <p className="text-sm font-medium text-ink">Still needed</p>
          {missingRequired.map(code => {
            const type = types?.types.find(item => item.code === code);
            return (
              <div key={code} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Badge tone="danger">{type?.label ?? code}</Badge>
                <DocumentUploader compact documentType={code} owner={owner} label="Upload" onUploaded={() => { toast(`${type?.label ?? 'Document'} uploaded.`); void reload(); }} />
              </div>
            );
          })}
        </div>
      )}

      {canManage && uploadable.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 sm:w-72">
            <label htmlFor="add-doc-type" className="mb-1.5 block text-sm font-medium text-ink">Add another document</label>
            <select id="add-doc-type" value={addType} onChange={event => setAddType(event.target.value)}
              className="h-11 w-full rounded-lg border border-line-strong bg-surface px-3 sm:h-10">
              <option value="">Choose document type…</option>
              {uploadable.map(type => <option key={type.code} value={type.code}>{type.label}</option>)}
            </select>
          </div>
          {addType && <DocumentUploader documentType={addType} owner={owner} compact onUploaded={() => { toast('Document uploaded.'); setAddType(''); void reload(); }} />}
        </div>
      )}

      <PreviewModal doc={preview} onClose={() => setPreview(null)} />
      <ReviewDialog doc={review} onClose={() => setReview(null)} onDone={() => { setReview(null); toast('Review saved.'); void reload(); }} />
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} title="Remove document?" tone="danger" confirmLabel="Remove" pending={removePending} onConfirm={remove}
        message="The document will no longer be used for your applications.">
        <TextInput label="Reason" value={removeReason} onChange={event => setRemoveReason(event.target.value)} placeholder="e.g. uploaded the wrong file" />
      </ConfirmDialog>
    </div>
  );
}
