import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';
interface ToastItem { id: number; type: ToastType; message: string; }

const ToastContext = createContext<{ push: (type: ToastType, message: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, type, message }]);
    // Section 7.4: success/info auto-dismiss after 4s; error persists until dismissed.
    if (type !== 'error') {
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), 4000);
    }
  }, []);
  const dismiss = (id: number) => setItems((s) => s.filter((i) => i.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="toast-container" aria-live="assertive">
        {items.map((i) => (
          <div key={i.id} className={`toast ${i.type}`} onClick={() => dismiss(i.id)}>
            {i.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
