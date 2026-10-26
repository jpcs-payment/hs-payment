import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "../lib/utils";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 4200);
  };

  return (
    <ToastContext.Provider value={{ pushToast }}>
      {children}
      <div className="fixed right-4 top-4 z-[70] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3" aria-live="polite">
        {toasts.map((toast) => {
          const Icon = toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;
          const iconClass = toast.tone === "success" ? "text-mint" : toast.tone === "error" ? "text-coral" : "text-navy-700";
          return (
            <div key={toast.id} className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 shadow-float">
              <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", iconClass)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy-900">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-xs leading-5 text-slate-500">{toast.message}</p> : null}
              </div>
              <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-navy-900" onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
};
