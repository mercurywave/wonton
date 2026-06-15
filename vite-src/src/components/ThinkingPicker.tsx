import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ReasoningEffort } from "../types/chat";
import styles from "../components/ThinkingPicker.module.css";
import { useChats } from "../contexts";

const OPTIONS: { value: ReasoningEffort; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function ThinkingPicker() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { activeReasoningEffort, onReasoningEffortChange } = useChats();

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

  const activeOption = OPTIONS.find((o) => o.value === activeReasoningEffort);
  const displayName = activeOption?.label || "None";

  return (
    <div className={styles.container} ref={dropdownRef}>
      <span className={styles.label}>Reasoning</span>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className={styles.selectedText}>
            {displayName}
          </span>
          {isOpen ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
        {isOpen && (
          <div className={styles.menu}>
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                className={`${styles.option} ${
                  option.value === activeReasoningEffort ? styles.active : ""
                }`}
                onClick={() => {
                  onReasoningEffortChange(option.value);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{option.label}</span>
                {option.value === activeReasoningEffort && (
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
