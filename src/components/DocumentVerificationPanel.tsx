import React, { useState } from 'react';
import { FileText, Eye, CheckCircle, XCircle, AlertCircle, RotateCcw, Loader2, Sparkles } from 'lucide-react';
import { documentsStore, alertsStore, extractionsStore, applicationsStore, type StoredDocument } from '../lib/store';
import { platformApi } from '../lib/platformApi';
import type { AlertNotification } from '../types';
import { processDocumentExtraction } from '../lib/documentExtractionService';

interface DocumentVerificationPanelProps {
  applicationId: string;
  userId?: string;
  onUpdate?: () => void;
}

type VerificationAction = 'Verified' | 'Rejected' | 'Pending';

interface DocWithStatus extends StoredDocument {
  status?: 'Pending' | 'Verified' | 'Rejected';
  verificationNote?: string;
}

export default function DocumentVerificationPanel({ applicationId: _applicationId, userId, onUpdate }: DocumentVerificationPanelProps) {
  const [docs, setDocs] = useState<DocWithStatus[]>(() =>
    userId ? (documentsStore.getForUser(userId) as DocWithStatus[]) : []
  );
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [noteInputId, setNoteInputId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');

  const applyAction = async (doc: DocWithStatus, action: VerificationAction, note?: string) => {
    setLoadingId(doc.id);
    const patch: Partial<DocWithStatus> = {
      status: action,
      verificationNote: note || undefined,
    };

    const synced = await platformApi.updateDocument(doc.id, patch);
    if (!synced) {
      documentsStore.update(doc.id, patch);
    }

    // Create alert for customer
    if (userId) {
      const alert: AlertNotification = {
        id: `alert-doc-${Date.now()}`,
        userId,
        type: action === 'Rejected' ? 'critical' : action === 'Verified' ? 'info' : 'warning',
        title: action === 'Rejected' ? 'Document Rejected' : action === 'Verified' ? 'Document Verified' : 'Document Requested',
        description: action === 'Rejected'
          ? `Your ${doc.name} was rejected by PINACO officers. ${note ? `Reason: ${note}` : 'Please re-upload a clearer copy.'}`
          : action === 'Verified'
          ? `Your ${doc.name} has been verified by PINACO compliance officers.`
          : `PINACO officers requested a fresh upload for ${doc.name}.`,
        date: new Date().toISOString(),
        isRead: false,
        actionLabel: 'View Documents',
        actionRoute: '/client/documents',
      };
      alertsStore.add(alert);
    }

    setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, ...patch } : d));
    setLoadingId(null);
    setNoteInputId(null);
    setNoteText('');
    onUpdate?.();
  };

  const handleRejectWithNote = (doc: DocWithStatus) => {
    if (noteInputId === doc.id) {
      applyAction(doc, 'Rejected', noteText);
    } else {
      setNoteInputId(doc.id);
      setNoteText('');
    }
  };

  if (!userId || docs.length === 0) {
    return (
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl p-4 flex items-center gap-3">
        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300 font-semibold">
          No documents uploaded by this applicant. Request documents before proceeding to approval.
        </p>
      </div>
    );
  }

  const statusIcon = (status?: string) => {
    if (status === 'Verified') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status === 'Rejected') return <XCircle className="w-4 h-4 text-red-600" />;
    return <AlertCircle className="w-4 h-4 text-amber-500" />;
  };

  const statusBadge = (status?: string) => {
    const base = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider';
    if (status === 'Verified') return `${base} bg-green-50 text-green-700 border border-green-200`;
    if (status === 'Rejected') return `${base} bg-red-50 text-red-700 border border-red-200`;
    return `${base} bg-amber-50 text-amber-700 border border-amber-200`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-on-surface">Document Verification</h3>
        <span className="text-xs text-secondary">
          {docs.filter(d => d.status === 'Verified').length}/{docs.length} verified
        </span>
      </div>

      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="border border-outline-variant rounded-xl p-4 bg-white dark:bg-[#1a1a1a] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="w-4 h-4 text-secondary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-on-surface truncate">{doc.name}</p>
                  <p className="text-[10px] text-secondary">{doc.category} &bull; Uploaded {new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  {doc.verificationNote && (
                    <p className="text-[10px] text-red-600 font-semibold mt-0.5">Note: {doc.verificationNote}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {statusIcon(doc.status)}
                <span className={statusBadge(doc.status)}>{doc.status || 'Pending'}</span>
              </div>
            </div>

            {/* Document Extraction & Comparison (Fix 1: Real Architecture) */}
            {(() => {
              const app = applicationsStore.getAllUnfiltered().find(a => a.id === _applicationId);
              let extraction = extractionsStore.getForDoc(doc.id);
              
              // If no stored extraction, evaluate manual/default extraction for app
              if (!extraction && app) {
                const docType = doc.category.includes('Payslip') ? 'Payslip' : doc.category.includes('ID') ? 'National ID' : 'Other';
                extraction = processDocumentExtraction({
                  documentId: doc.id,
                  applicationId: _applicationId,
                  userId,
                  documentType: docType,
                  source: 'manual',
                  manualData: {
                    applicantName: app.applicantName,
                    employer: app.sector,
                    monthlySalary: app.monthlyRevenue,
                  },
                }, app);
              }

              if (!extraction) return null;

              return (
                <div className={`p-3 rounded-lg border text-xs space-y-1 ${
                  extraction.verificationStatus === 'Mismatch'
                    ? 'bg-red-50 dark:bg-red-950/20 border-red-200 text-red-800 dark:text-red-300'
                    : 'bg-green-50 dark:bg-green-950/20 border-green-200 text-green-800 dark:text-green-300'
                }`}>
                  <div className="flex items-center justify-between font-bold">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" /> Extraction Status ({extraction.source}):
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${
                      extraction.verificationStatus === 'Mismatch' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'
                    }`}>
                      {extraction.verificationStatus === 'Mismatch' ? 'MISMATCH ⚠️' : 'MATCH ✅'}
                    </span>
                  </div>

                  {extraction.mismatches.length > 0 ? (
                    <div className="space-y-0.5 text-[11px]">
                      {extraction.mismatches.map((m, idx) => (
                        <p key={idx} className="font-semibold text-red-700 dark:text-red-400">{m}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-green-700 dark:text-green-400 font-medium">
                      Extracted document data matches application declarations.
                    </p>
                  )}
                </div>
              );
            })()}

            {noteInputId === doc.id && (
              <div className="space-y-2">
                <textarea
                  className="w-full text-xs border border-outline-variant rounded-lg p-2 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                  rows={2}
                  placeholder="Reason for rejection (customer will see this)..."
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1 border-t border-surface-container">
              {doc.base64 && (
                <a
                  href={doc.base64}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:underline"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View
                </a>
              )}

              <button
                disabled={loadingId === doc.id}
                onClick={() => applyAction(doc, 'Verified')}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                {loadingId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                Verify
              </button>

              <button
                disabled={loadingId === doc.id}
                onClick={() => handleRejectWithNote(doc)}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                {noteInputId === doc.id ? 'Confirm Reject' : 'Reject'}
              </button>

              <button
                disabled={loadingId === doc.id}
                onClick={() => applyAction(doc, 'Pending')}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-secondary hover:bg-surface-container border border-outline-variant px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Re-request
              </button>

              {noteInputId === doc.id && (
                <button
                  onClick={() => setNoteInputId(null)}
                  className="text-[11px] font-semibold text-secondary hover:underline ml-1"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

