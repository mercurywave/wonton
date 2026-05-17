import { useState, useMemo } from "react";
import { Hammer } from "lucide-react";
import styles from "../components/ToolCallSection.module.css";
import { ToolCall } from "../types/chat";

export default function ToolCallSection({ toolCall, result }: { toolCall: ToolCall; result?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [parsedArgs] = useState<object | null>(() => {
    try {
      return JSON.parse(toolCall.arguments);
    } catch {
      return { raw: toolCall.arguments };
    }
  });
  const parsedResult = useMemo(() => {
    if (result == null) return { formatted: "", isJson: false };
    try {
      const obj = JSON.parse(result);
      return { formatted: JSON.stringify(obj, null, 2), isJson: true };
    } catch {
      return { formatted: result, isJson: false };
    }
  }, [result]);

  return (
    <div className={styles.toolCallSection}>
      <button
        className={styles.toolCallHeader}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <Hammer className={styles.toolCallIcon} size={14} />
        <span className={styles.toolCallName}>{toolCall.name}</span>
        <span className={styles.toolCallArrow}>{isExpanded ? "▲" : "▼"}</span>
      </button>
      {isExpanded && (
        <div className={styles.toolCallBody}>
          <div className={styles.toolCallSectionLabel}>Arguments</div>
          <pre className={styles.toolCallArgs}>
            {JSON.stringify(parsedArgs, null, 2)}
          </pre>
          {parsedResult.isJson && (
            <>
              <div className={styles.toolCallSectionLabel}>Response</div>
              <pre className={styles.toolCallResponse}>
                {parsedResult.formatted}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}
