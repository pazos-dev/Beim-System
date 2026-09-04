"use client";

import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastOptions {
  readonly duration?: number;
}

interface ToastItem {
  readonly id: string;
  readonly kind: ToastKind;
  readonly message: string;
}

export interface ToastApi {
  readonly showToast: (message: string, kind?: ToastKind, options?: ToastOptions) => void;
  readonly success: (message: string, options?: ToastOptions) => void;
  readonly error: (message: string, options?: ToastOptions) => void;
  readonly info: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  readonly children: ReactNode;
  readonly duration?: number;
}

const kindClasses: Record<ToastKind, string> = {
  success: "border-success/30 bg-success/10 text-success-strong",
  error: "border-danger/30 bg-danger/10 text-danger-strong",
  info: "border-info/30 bg-info/10 text-info-strong"
};

export function ToastProvider({ children, duration = 4000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  };

  const showToast = (message: string, kind: ToastKind = "info", options?: ToastOptions) => {
    const id = `toast-${nextId.current++}`;
    setToasts((current) => [...current, { id, kind, message }]);
    const timer = setTimeout(() => dismiss(id), options?.duration ?? duration);
    timers.current.set(id, timer);
  };

  useEffect(() => {
    return () => {
      timers.current.forEach((timer) => clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  const api: ToastApi = {
    error: (message, options) => showToast(message, "error", options),
    info: (message, options) => showToast(message, "info", options),
    showToast,
    success: (message, options) => showToast(message, "success", options)
  };

  return (
    <ToastContext value={api}>
      {children}
      <div aria-atomic="false" aria-label="Notificaciones" aria-live="polite" className="fixed right-4 top-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-3" role="region">
        {toasts.map((toast) => (
          <div
            className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-shell ${kindClasses[toast.kind]}`}
            key={toast.id}
            role="status"
          >
            <span>{toast.message}</span>
            <button
              aria-label="Cerrar notificación"
              className="font-semibold underline underline-offset-2"
              onClick={() => dismiss(toast.id)}
              type="button"
            >
              Cerrar
            </button>
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const context = use(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return context;
}
