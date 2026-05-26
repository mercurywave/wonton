import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import styles from "./SelectionBubble.module.css";

interface SelectionBubbleProps {
  position: { left: number; top: number } | null;
  selectedText: string;
  onComment: (selectedText: string) => void;
}

export default function SelectionBubble({ position, selectedText, onComment }: SelectionBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);

  // Dismiss on click outside
  useEffect(() => {
    if (!position) return;

    const handleClick = (e: MouseEvent) => {
      if (bubbleRef.current && !bubbleRef.current.contains(e.target as Node)) {
        onComment("");
      }
    };

    requestAnimationFrame(() => {
      document.addEventListener("mousedown", handleClick);
    });

    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [position, onComment]);

  if (!position) return null;

  return (
    <div
      ref={bubbleRef}
      className={styles.bubble}
      style={{ left: position.left, top: position.top }}
    >
      <button
        className={styles.commentBtn}
        onClick={() => onComment(selectedText)}
        title="Comment on selection"
      >
        <MessageCircle size={16} />
      </button>
    </div>
  );
}
