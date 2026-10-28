import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Branding } from '../api/types';

let cached: Promise<Branding> | null = null;

/** Institution name and public contact details, from the server's branding setting. */
export function useBranding(): Branding | null {
  const [branding, setBranding] = useState<Branding | null>(null);
  useEffect(() => {
    cached ??= api<Branding>('/api/public/branding');
    cached.then(value => {
      setBranding(value);
      document.title = value.institutionName;
    }).catch(() => { cached = null; });
  }, []);
  return branding;
}
