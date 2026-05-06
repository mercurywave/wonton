import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { ServerModel } from "../types/chat";
import { getDisplayName } from "../utils/modelUtils";
import styles from "../components/ModelPicker.module.css";

interface ModelPickerProps {
  models: ServerModel[];
  activeModel: string;
  onModelChange: (modelId: string) => void;
  modelAliases: Record<string, string>;
}

export default function ModelPicker({
  models,
  activeModel,
  onModelChange,
  modelAliases,
}: ModelPickerProps) {
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

  if (models.length === 0) return null;

  const displayName = getDisplayName(activeModel, modelAliases);

  return (
    <div className={styles.container} ref={dropdownRef}>
      <span className={styles.label}>Model</span>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsOpen((prev) => !prev)}
          disabled={models.length === 0}
        >
          <span className={styles.selectedText}>
            {displayName || "Select model..."}
          </span>
          {isOpen ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
        {isOpen && (
          <div className={styles.menu}>
            {models.map((model) => (
              <button
                key={model.id}
                className={`${styles.option} ${
                  model.id === activeModel ? styles.active : ""
                }`}
                onClick={() => {
                  onModelChange(model.id);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{getDisplayName(model.id, modelAliases)}</span>
                {model.id === activeModel && (
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
