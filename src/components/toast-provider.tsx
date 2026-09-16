"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CircleCheck, TriangleAlert, X } from "lucide-react";

type ToastTone = "success" | "error";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function ToastItem({
  toast,
  dismiss,
}: {
  toast: Toast;
  dismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (toast.tone === "error") return;
    const timer = window.setTimeout(() => dismiss(toast.id), 5000);
    return () => window.clearTimeout(timer);
  }, [dismiss, toast.id, toast.tone]);

  return (
    <div
      className={`toast-notification ${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      {toast.tone === "error" ? (
        <TriangleAlert size={22} aria-hidden="true" />
      ) : (
        <CircleCheck size={22} aria-hidden="true" />
      )}
      <p>{toast.message}</p>
      <button
        type="button"
        aria-label="通知を閉じる"
        onClick={() => dismiss(toast.id)}
      >
        <X size={19} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = "success") => {
      const toast = { id: ++nextId.current, message, tone };
      setToasts((current) =>
        current.some(
          (active) => active.message === message && active.tone === tone,
        )
          ? current
          : [...current.slice(-2), toast],
      );
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-region">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function ToastOnMount({
  message,
  tone = "success",
}: {
  message: string;
  tone?: ToastTone;
}) {
  const { showToast } = useToast();

  useEffect(() => {
    showToast(message, tone);
  }, [message, showToast, tone]);

  return null;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
}
