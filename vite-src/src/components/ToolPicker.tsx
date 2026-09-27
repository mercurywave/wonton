import { useRef, useEffect } from "react";
import { Check } from "lucide-react";
import { ToolDefinition } from "../types/chat";
import styles from "../components/ToolPicker.module.css";

interface ToolPickerProps {
  availableTools: ToolDefinition[];
  enabledToolNames: string[];
  onToolSetChange: (toolNames: string[]) => void;
  onClose: () => void;
}

export default function ToolPicker({
  availableTools,
  enabledToolNames,
  onToolSetChange,
  onClose,
}: ToolPickerProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const handleToggleTool = (toolName: string) => {
    const isEnabled = enabledToolNames.includes(toolName);
    const newEnabledTools = isEnabled
      ? enabledToolNames.filter((t) => t !== toolName)
      : [...enabledToolNames, toolName];
    onToolSetChange(newEnabledTools);
  };

  const handleSelectNone = () => {
    onToolSetChange([]);
  };

  const handleSelectAll = () => {
    onToolSetChange(availableTools.map((t) => t.function.name));
  };

  if (availableTools.length === 0) {
    return null;
  }

  return (
    <div ref={popupRef} className={styles.popupWrapper}>
      <div className={styles.popup}>
        <div className={styles.popupHeader}>
          <span>Tools</span>
          <div className={styles.popupActions}>
            <button
              className={styles.actionBtn}
              onClick={handleSelectAll}
              type="button"
              title="Select all tools"
            >
              All
            </button>
            <span className={styles.actionSeparator}>·</span>
            <button
              className={styles.actionBtn}
              onClick={handleSelectNone}
              type="button"
              title="Deselect all tools"
            >
              None
            </button>
          </div>
        </div>
        <div className={styles.popupBody}>
          {availableTools.map((tool) => {
            const isEnabled = enabledToolNames.includes(tool.function.name);
            return (
              <button
                key={tool.function.name}
                className={`${styles.toolOption} ${isEnabled ? styles.toolOptionActive : ""}`}
                onClick={() => handleToggleTool(tool.function.name)}
                type="button"
                title={tool.function.description}
              >
                <span className={styles.toolName}>{tool.function.name}</span>
                {isEnabled && <Check size={14} className={styles.checkIcon} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
