import { useState, useCallback, useRef, useEffect } from "react";
import styles from "./SplitPanel.module.css";

interface SplitPanelProps {
  leftChild: React.ReactNode;
  rightChild: React.ReactNode;
  initialRatio?: number;
  leftMinWidth?: number;
  rightMinWidth?: number;
  dividerWidth?: number;
}

export default function SplitPanel({
  leftChild,
  rightChild,
  initialRatio = 0.5,
  leftMinWidth = 200,
  rightMinWidth = 200,
  dividerWidth = 4,
}: SplitPanelProps) {
  const [ratio, setRatio] = useState(initialRatio);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availableWidth = rect.width - dividerWidth;
      const newRatio = Math.max(
        leftMinWidth,
        Math.min(availableWidth - rightMinWidth, e.clientX - rect.left)
      ) / availableWidth;
      setRatio(newRatio);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dividerWidth, leftMinWidth, rightMinWidth]);

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.left} style={{ width: `${ratio * 100}%` }}>
        {leftChild}
      </div>
      <div
        className={styles.divider}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        tabIndex={0}
      />
      <div className={styles.right} style={{ width: `${(1 - ratio) * 100}%` }}>
        {rightChild}
      </div>
    </div>
  );
}
