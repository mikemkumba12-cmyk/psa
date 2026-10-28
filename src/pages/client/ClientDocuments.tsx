import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { DocumentList } from '../../features/documents/Documents';
import { Alert } from '../../ui/Feedback';
import { Card, PageHeader } from '../../ui/Layout';

/** The customer's personal documents. Business and application documents live on those pages. */
export function ClientDocuments() {
  const { profile } = useAuth();
  if (!profile?.customer) return null;
  return (
    <>
      <PageHeader title="My documents" description="Identity and income documents linked to your profile." />
      <div className="space-y-4">
        <Alert tone="info">Files are stored privately. Only you and authorised Pinnacle staff can open them, and every view is recorded.</Alert>
        <Card>
          <DocumentList owner={{ customerId: profile.customer.id }} canManage requiredTypes={['national_id_front', 'national_id_back']}
            emptyText="Start by uploading both sides of your national ID." />
        </Card>
      </div>
    </>
  );
}
