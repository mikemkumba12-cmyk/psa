import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Trash2, ChevronLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { documentsStore, type StoredDocument } from '../lib/store';
import { recordAuditEvent } from '../lib/auditTrail';
import { platformApi } from '../lib/platformApi';

interface DocumentUploadProps {
  onBack: () => void;
}

interface DocItem {
  id: string;
  label: string;
  required: boolean;
  status: 'pending' | 'uploaded' | 'verified' | 'rejected';
  fileName?: string;
  fileSize?: string;
}

const initialDocs: DocItem[] = [
  { id: 'national_id', label: 'National ID (Front & Back)', required: true, status: 'pending' },
  { id: 'payslip', label: 'Latest 3 Payslips', required: true, status: 'pending' },
  { id: 'bank_stmt', label: 'Bank Statement (3 months)', required: true, status: 'pending' },
  { id: 'proof_addr', label: 'Proof of Address', required: false, status: 'pending' },
  { id: 'biz_reg', label: 'Business Registration (SME)', required: false, status: 'pending' },
  { id: 'audited', label: 'Audited Accounts (SME)', required: false, status: 'pending' },
];

export default function DocumentUpload({ onBack }: DocumentUploadProps) {
  const { session } = useAuth();
  const [docs, setDocs] = useState<DocItem[]>(initialDocs);
  const [activeUpload, setActiveUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !pendingDocId) return;

    setActiveUpload(pendingDocId);
    
    // Send actual file to server (multipart/form-data)
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', pendingDocId);
    
    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('psa_auth_token') || ''}`,
        },
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const uploadResult = await response.json() as { id: string; fileName: string; fileSize: string; uploadedAt: string; category: string };
      
      // Store metadata locally (not the full file)
      const storedDoc: StoredDocument = {
        id: uploadResult.id,
        userId: session?.userId || 'guest',
        name: uploadResult.fileName,
        type: file.type,
        size: file.size,
        uploadedAt: uploadResult.uploadedAt,
        category: pendingDocId,
        filePath: `/api/documents/${uploadResult.id}/download`, // Server path, not base64
      };
      documentsStore.add(storedDoc);
      
      recordAuditEvent({
        actorId: session?.userId || 'guest',
        actorName: session?.fullName || 'Guest User',
        actorRole: 'client',
        action: 'document.upload',
        entityType: 'document',
        entityId: uploadResult.id,
        outcome: 'success',
        summary: `Document uploaded for ${pendingDocId}.`,
        metadata: { category: pendingDocId, fileName: file.name, size: file.size },
      });
      
      setDocs(prev => prev.map(d =>
        d.id === pendingDocId
          ? { ...d, status: 'uploaded', fileName: file.name, fileSize: uploadResult.fileSize }
          : d
      ));
    } catch (error) {
      console.error('Document upload failed:', error);
      alert('Failed to upload document. Please try again.');
    } finally {
      setActiveUpload(null);
      setPendingDocId(null);
    }
    
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const triggerUpload = (docId: string) => {
    setPendingDocId(docId);
    fileInputRef.current?.click();
  };

  const removeDoc = (docId: string) => {
    setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: 'pending', fileName: undefined, fileSize: undefined } : d));
  };

  const uploadedCount = docs.filter(d => d.status === 'uploaded' || d.status === 'verified').length;
  const requiredCount = docs.filter(d => d.required).length;
  const uploadedRequired = docs.filter(d => d.required && (d.status === 'uploaded' || d.status === 'verified')).length;

  const handleSubmitDocuments = () => {
    recordAuditEvent({
      actorId: session?.userId || 'guest',
      actorName: session?.fullName || 'Guest User',
      actorRole: 'client',
      action: 'kyc.documents_submit',
      entityType: 'kyc_package',
      entityId: session?.userId || 'guest',
      outcome: 'success',
      summary: 'Client submitted required KYC documents for review.',
      metadata: { uploadedRequired, requiredCount, uploadedCount },
    });
    onBack();
  };

  return (
    <div className="space-y-5">
      {/* Hidden real file input */}
      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileChange} />
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={handleSubmitDocuments} className="w-9 h-9 rounded-xl border border-gray-200 dark:border-white/10 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Upload Documents</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Required for loan verification</p>
        </div>
      </div>

      {/* Progress Summary */}
      <div className="bg-white dark:bg-white/[0.04] border border-gray-100 dark:border-white/10 rounded-2xl p-4 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Upload Progress</span>
          <span className="text-xs font-bold text-orange-500">{uploadedCount}/{docs.length} files</span>
        </div>
        <div className="w-full bg-gray-100 dark:bg-white/10 rounded-full h-2">
          <div
            className="bg-orange-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${(uploadedCount / docs.length) * 100}%` }}
          />
        </div>
        <div className="flex items-center gap-2">
          {uploadedRequired === requiredCount ? (
            <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-orange-500" />
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {uploadedRequired === requiredCount
              ? 'All required documents uploaded! Optional docs improve approval chances.'
              : `${requiredCount - uploadedRequired} required document(s) still needed`}
          </p>
        </div>
      </div>

      {/* Document List */}
      <div className="space-y-3">
        {docs.map(doc => (
          <div key={doc.id} className={`bg-white dark:bg-white/[0.04] border rounded-2xl p-4 transition-all ${
            doc.status === 'uploaded' ? 'border-green-200 dark:border-green-500/30' :
            doc.status === 'rejected' ? 'border-red-200 dark:border-red-500/30' :
            'border-gray-100 dark:border-white/10'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  doc.status === 'uploaded' || doc.status === 'verified' ? 'bg-green-100 dark:bg-green-500/20' :
                  doc.status === 'rejected' ? 'bg-red-100 dark:bg-red-500/20' :
                  activeUpload === doc.id ? 'bg-orange-100 dark:bg-orange-500/20' :
                  'bg-gray-100 dark:bg-white/5'
                }`}>
                  {doc.status === 'uploaded' || doc.status === 'verified' ? (
                    <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                  ) : doc.status === 'rejected' ? (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  ) : activeUpload === doc.id ? (
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <FileText className="w-5 h-5 text-gray-400 dark:text-gray-500" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{doc.label}</p>
                    {doc.required && (
                      <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider bg-orange-100 dark:bg-orange-500/10 px-1.5 py-0.5 rounded-full">Required</span>
                    )}
                  </div>
                  {doc.fileName ? (
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{doc.fileName} · {doc.fileSize}</p>
                  ) : activeUpload === doc.id ? (
                    <p className="text-[10px] text-orange-500 mt-0.5 font-semibold">Reading file…</p>
                  ) : (
                    <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-0.5">No file selected</p>
                  )}
                </div>
              </div>
              {doc.status === 'pending' && activeUpload !== doc.id && (
                <button onClick={() => triggerUpload(doc.id)}
                  className="flex-shrink-0 h-9 px-3 bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400 text-[11px] font-bold rounded-xl hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" /> Choose File
                </button>
              )}
              {(doc.status === 'uploaded' || doc.status === 'verified') && (
                <button onClick={() => removeDoc(doc.id)}
                  className="flex-shrink-0 w-9 h-9 bg-red-50 dark:bg-red-500/10 rounded-xl flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Submit Button */}
      {uploadedRequired === requiredCount && (
        <button onClick={handleSubmitDocuments}
          className="w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-2xl text-sm font-bold shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Submit Documents for Review
        </button>
      )}
    </div>
  );
}
