import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, List } from "lucide-react";
import styles from "../components/LogSelector.module.css";

interface LogSelectorProps {
  logs: LogOption[];
  activeLogId: string;
  onLogChange: (logId: string) => void;
}

interface LogOption {
  id: string;
  label: string;
}

export default function LogSelector({
  logs,
  activeLogId,
  onLogChange,
}: LogSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (logs.length <= 1) return null;

  return (
    <div className={styles.container} ref={dropdownRef}>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsOpen((prev) => !prev)}
          title="Switch log"
        >
          <span className={styles.triggerContent}>
            <List size={14} />
            {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
        {isOpen && (
          <div className={styles.menu}>
            {logs.map((log) => (
              <button
                key={log.id}
                className={`${styles.option} ${
                  log.id === activeLogId ? styles.active : ""
                }`}
                onClick={() => {
                  onLogChange(log.id);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{log.label}</span>
                {log.id === activeLogId && (
                  <span className={styles.checkmark}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
