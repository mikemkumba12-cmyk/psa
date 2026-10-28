import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

interface ToastItem { id: number; tone: 'success' | 'error'; message: string }
const ToastContext = createContext<(message: string, tone?: 'success' | 'error') => void>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    const id = Date.now() + Math.random();
    setItems(current => [...current.slice(-2), { id, tone, message }]);
    setTimeout(() => setItems(current => current.filter(item => item.id !== id)), tone === 'error' ? 8000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end">
        {items.map(item => (
          <div key={item.id} className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg p-3 text-sm shadow-lg ring-1 ${item.tone === 'success' ? 'bg-surface text-ink ring-line' : 'bg-danger-50 text-danger-700 ring-danger-700/20'}`}>
            {item.tone === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success-700" aria-hidden /> : <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />}
            <p className="min-w-0 flex-1 break-words">{item.message}</p>
            <button type="button" aria-label="Dismiss" onClick={() => setItems(current => current.filter(entry => entry.id !== item.id))} className="text-ink-subtle hover:text-ink">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
