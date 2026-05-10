import { useState, useRef, useEffect } from "react";
import { Wrench } from "lucide-react";
import { ToolDefinition } from "../types/chat";
import styles from "../components/ToolPicker.module.css";

interface ToolPickerProps {
  tools: ToolDefinition[];
}

export default function ToolPicker({ tools }: ToolPickerProps) {
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

  if (tools.length === 0) return null;

  return (
    <div className={styles.container} ref={dropdownRef}>
      <button
        className={`${styles.trigger} ${isOpen ? styles.active : ""}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Available tools"
      >
        <Wrench size={16} />
      </button>
      {isOpen && (
        <div className={styles.popup}>
          <div className={styles.popupHeader}>
            <span>Available Tools</span>
            <button className={styles.closeBtn} onClick={() => setIsOpen(false)}>
              ×
            </button>
          </div>
          <div className={styles.toolList}>
            {tools.map((tool) => (
              <div key={tool.function.name} className={styles.toolItem}>
                <span className={styles.toolName}>{tool.function.name}</span>
                <div className={styles.toolDescription}>{tool.function.description}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
