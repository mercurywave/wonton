import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { filesystem } from "@neutralinojs/lib";
import styles from "./DocumentViewerPanel.module.css";

interface DocumentViewerPanelProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
}

function isMarkdownFile(name: string): boolean {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export default function DocumentViewerPanel({
  filePath,
  fileName,
  onClose,
}: DocumentViewerPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFile = useCallback(async () => {
    try {
      const stat = await filesystem.getStats(filePath);
      if (!stat || stat.isDirectory) {
        setError("File not found");
        return;
      }
      const fileContent = await filesystem.readFile(filePath);
      setContent(fileContent ?? null);
      setError(null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null) {
        setError((err as any).message || (err as any).msg || JSON.stringify(err));
      } else {
        setError(String(err));
      }
    }
  }, [filePath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  const markdown = isMarkdownFile(fileName);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.fileName}>{fileName}</span>
        <button className={styles.closeButton} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      <div className={styles.content}>
        {error && <div className={styles.error}>{error}</div>}
        {content !== null && (
          markdown ? (
            <div className={styles.markdownContent}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className={styles.textContent}>{content}</pre>
          )
        )}
      </div>
    </div>
  );
}
