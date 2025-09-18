import React, { createContext, useContext, useState } from 'react';

type Toast = { id: string; text: string; };
const ToastCtx = createContext<{ push: (t: string) => void } | null>(null);

type ProviderProps = { children?: React.ReactNode };

export const ToastProvider: React.FC<ProviderProps> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string) => {
    const t = { id: Math.random().toString(36).slice(2), text };
    setToasts(v => [...v, t]); setTimeout(() => setToasts(v => v.filter(x => x.id !== t.id)), 1600);
  };
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed right-[440px] bottom-4 space-y-2 z-[2147483647]">
        {toasts.map(t => (
          <div key={t.id} className="bg-black/70 text-white px-3 py-2 rounded-lg shadow-lg text-sm">
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export const ToastHost = ToastProvider;

export const useToast = () => {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('ToastCtx missing');
  return ctx;
};
