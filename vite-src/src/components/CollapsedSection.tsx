import React, { useState, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import styles from "./CollapsedSection.module.css";

interface CollapsedSectionProps {
  count: number;
  label?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function CollapsedSection({ count, label, children, defaultOpen = false }: CollapsedSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const sectionRef = useRef<HTMLDivElement>(null);

  return (
    <div className={styles.container} ref={sectionRef}>
      <button
        className={styles.header}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-expanded={isOpen}
        title={isOpen ? "Collapse" : "Expand"}
      >
        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        <span className={styles.countLabel}>
          {count} {label || (count === 1 ? "event" : "events")}
        </span>
      </button>
      {isOpen && <div className={styles.content}>{children}</div>}
    </div>
  );
}
