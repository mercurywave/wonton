import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import styles from "../components/FileSelector.module.css";

interface TempFileSelectorProps {
  files: Array<{ baseName: string; uniqueName: string }>;
  activeFileUniqueName: string | null;
  onFileSelect: (uniqueName: string) => void;
}

export default function TempFileSelector({
  files,
  activeFileUniqueName,
  onFileSelect,
}: TempFileSelectorProps) {
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

  if (files.length === 0) return null;

  return (
    <div className={styles.container} ref={dropdownRef}>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsOpen((prev) => !prev)}
          title="View temp file"
        >
          <span className={styles.triggerContent}>
            <FileText size={14} />
            {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </button>
        {isOpen && (
          <div className={styles.menu}>
            {files.map((file) => (
              <button
                key={file.uniqueName}
                className={`${styles.option} ${
                  file.uniqueName === activeFileUniqueName ? styles.active : ""
                }`}
                onClick={() => {
                  onFileSelect(file.uniqueName);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{file.baseName}</span>
                {file.uniqueName === activeFileUniqueName && (
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
