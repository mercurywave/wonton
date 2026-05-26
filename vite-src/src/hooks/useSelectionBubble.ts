import { useState, useEffect, useCallback } from "react";

export interface SelectionBubbleData {
  left: number;
  top: number;
  text: string;
}

export function useSelectionBubble(containerRef: React.RefObject<HTMLElement | null>) {
  const [bubbleData, setBubbleData] = useState<SelectionBubbleData | null>(null);

  useEffect(() => {
    const handlePointerUp = () => {
      if (!containerRef.current) {
        setBubbleData(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setBubbleData(null);
        return;
      }
      if (!containerRef.current.contains(sel.anchorNode!)) {
        setBubbleData(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length === 0) {
        setBubbleData(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setBubbleData(null);
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      setBubbleData({
        left: rect.left - containerRect.left + rect.width / 2,
        top: rect.top - containerRect.top - 8,
        text,
      });
    };

    const handlePointerDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setBubbleData(null);
      }
    };

    containerRef.current?.addEventListener("pointerup", handlePointerUp);
    containerRef.current?.addEventListener("pointerdown", handlePointerDown);

    return () => {
      containerRef.current?.removeEventListener("pointerup", handlePointerUp);
      containerRef.current?.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [containerRef]);

  const dismiss = useCallback(() => {
    setBubbleData(null);
  }, []);

  return { bubbleData, dismiss };
}
