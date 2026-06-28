import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  ReactNode,
} from "react";

export type ToastSeverity = "info" | "success" | "warning" | "error";

export interface ToastData {
  id: string;
  message: string;
  severity: ToastSeverity;
}

interface ToastValue {
  addToast: (message: string, severity?: ToastSeverity) => void;
  dismissToast: (id: string) => void;
  toasts: ToastData[];
}

const ToastContext = createContext<ToastValue | null>(null);

const SEVERITY_TIMEOUTS: Record<ToastSeverity, number> = {
  info: 5000,
  success: 5000,
  warning: 7000,
  error: 0,
};

let nextId = 0;

function addToastImpl(message: string, severity: ToastSeverity = "info"): string {
  const id = `toast-${++nextId}-${Date.now()}`;
  emit("toast-add", { id, message, severity });
  const timeout = SEVERITY_TIMEOUTS[severity];
  if (timeout > 0) {
    setTimeout(() => {
      emit("toast-dismiss", id);
    }, timeout);
  }
  return id;
}

function dismissToastImpl(id: string) {
  emit("toast-dismiss", id);
}

const handlers: Record<string, Set<(payload: unknown) => void>> = {};

function emit(event: string, payload?: unknown) {
  const h = handlers[event];
  if (h) {
    for (const handler of h) handler(payload);
  }
}

function on(event: string, handler: (payload: unknown) => void): () => void {
  if (!handlers[event]) {
    handlers[event] = new Set();
  }
  handlers[event].add(handler);
  return () => {
    handlers[event]?.delete(handler);
  };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  useEffect(() => {
    const removeAdd = on("toast-add", (payload: unknown) => {
      const { id, message, severity } = payload as { id: string; message: string; severity: ToastSeverity };
      setToasts((prev) => [...prev, { id, message, severity }]);
    });

    const removeDismiss = on("toast-dismiss", (payload: unknown) => {
      const id = payload as string;
      setToasts((prev) => prev.filter((t) => t.id !== id));
    });

    return () => {
      removeAdd();
      removeDismiss();
    };
  }, []);

  const addToast = useCallback((message: string, severity?: ToastSeverity) => {
    return addToastImpl(message, severity);
  }, []);

  const dismissToast = useCallback((id: string) => {
    dismissToastImpl(id);
  }, []);

  const value = useMemo(() => ({ addToast, dismissToast, toasts }), [addToast, dismissToast, toasts]);

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export { addToastImpl as addToast, dismissToastImpl as dismissToast };
