import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { filesystem } from "@neutralinojs/lib";
import styles from "../components/FileViewerPanel.module.css";
import { resolveTempFilePath, getProjectDataDir } from "../utils/neuUtils";
import { TempFileReservation } from "../types/chat";

interface TempFileViewerPanelProps {
  uniqueName: string;
  baseName: string;
  reservedTempFiles: TempFileReservation[];
  projectId: string;
  onClose: () => void;
}

function isMarkdownFile(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export default function TempFileViewerPanel({
  uniqueName,
  baseName,
  reservedTempFiles,
  projectId,
  onClose,
}: TempFileViewerPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadFile = useCallback(async () => {
    setContent(null);
    setError(null);
    setFileExists(null);
    setIsLoading(true);

    try {
      const dataDir = await getProjectDataDir(projectId);
      if (!dataDir) {
        setError("Unable to resolve project data directory");
        return;
      }

      const tempResult = await resolveTempFilePath(
        uniqueName,
        projectId,
        reservedTempFiles
      );

      if (!tempResult.redirected) {
        setError("Unable to resolve temp file path");
        return;
      }

      const stat = await filesystem.getStats(tempResult.tmpPath);
      if (!stat) {
        setFileExists(false);
        return;
      }

      setFileExists(true);
      const fileContent = await filesystem.readFile(tempResult.tmpPath);
      setContent(fileContent ?? null);
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === "object" && err !== null) {
        setError((err as any).message || (err as any).msg || JSON.stringify(err));
      } else {
        setError(String(err));
      }
    } finally {
      setIsLoading(false);
    }
  }, [uniqueName, projectId, reservedTempFiles]);

  useEffect(() => {
    if (!projectId || !reservedTempFiles.some((f) => f.uniqueName === uniqueName)) {
      onClose();
      return;
    }
    loadFile();
  }, [uniqueName, projectId, reservedTempFiles, loadFile, onClose]);

  const markdown = isMarkdownFile(baseName);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.fileName}>{baseName}</span>
        <button className={styles.closeButton} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      <div className={styles.content}>
        {isLoading && (
          <div className={styles.placeholder}>Loading...</div>
        )}
        {fileExists === false && (
          <div className={styles.placeholder}>
            This temp file hasn&apos;t been created yet. It will appear once the agent writes to it.
          </div>
        )}
        {error && <div className={styles.error}>{error}</div>}
        {fileExists && content !== null && (
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
