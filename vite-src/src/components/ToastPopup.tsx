import { useToast, type ToastData, type ToastSeverity } from "../contexts/ToastContext";
import styles from "./ToastPopup.module.css";

const SEVERITY_COLORS: Record<ToastSeverity, string> = {
  info: "#4a6cf7",
  success: "#34d399",
  warning: "#fbbf24",
  error: "#f87171",
};

const SEVERITY_ICONS: Record<ToastSeverity, string> = {
  info: "i",
  success: "\u2713",
  warning: "!",
  error: "\u2715",
};

function ToastItem({ toast, onDismiss }: { toast: ToastData; onDismiss: (id: string) => void }) {
  const color = SEVERITY_COLORS[toast.severity];
  const icon = SEVERITY_ICONS[toast.severity];

  return (
    <div
      className={styles.toast}
      style={{"--toast-color": color} as React.CSSProperties}
    >
      <span className={styles.icon} style={{ color }}>{icon}</span>
      <span className={styles.message}>{toast.message}</span>
      <button
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        type="button"
        aria-label="Dismiss"
      >
        {"\u00d7"}
      </button>
    </div>
  );
}

export default function ToastPopup() {
  const { toasts, dismissToast } = useToast();

  return (
    <div className={styles.container} aria-live="polite" aria-relevant="additions removals">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={dismissToast} />
      ))}
    </div>
  );
}
