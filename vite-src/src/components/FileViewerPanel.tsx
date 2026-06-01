import { useState, useEffect, useCallback, useRef } from "react";
import { useSelectionBubble } from "../hooks/useSelectionBubble";
import { X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { filesystem, events } from "@neutralinojs/lib";
import styles from "../components/FileViewerPanel.module.css";
import { resolveTempFilePath, getProjectDataDir } from "../utils/neuUtils";
import { TempFileReservation } from "../types/chat";
import { useEventBus } from "../contexts";
import SelectionBubble from "./SelectionBubble";

interface TempFileViewerPanelProps {
  uniqueName: string;
  reservedTempFiles: TempFileReservation[];
  projectId: string;
  onClose: () => void;
}

function isMarkdownFile(name: string): boolean {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export default function TempFileViewerPanel({
  uniqueName,
  reservedTempFiles,
  projectId,
  onClose,
}: TempFileViewerPanelProps) {
  const baseName = reservedTempFiles.find((f) => f.uniqueName === uniqueName)?.baseName ?? uniqueName;
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileExists, setFileExists] = useState<boolean | null>(null);
  const contentContainerRef = useRef<HTMLDivElement>(null);
  const { bubbleData, dismiss: dismissBubble } = useSelectionBubble(contentContainerRef);
  const { emit } = useEventBus();

  const loadFile = useCallback(async () => {
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

      const fileContent = await filesystem.readFile(tempResult.tmpPath);
      setFileExists(true);
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
  }, [uniqueName, projectId, reservedTempFiles]);

  useEffect(() => {
    if (!projectId || !reservedTempFiles.some((f) => f.uniqueName === uniqueName)) {
      onClose();
      return;
    }
    loadFile();
  }, [uniqueName, projectId, loadFile, onClose]);

  const watcherIdRef = useRef<number>(0);
  const loadFileRef = useRef(loadFile);
  loadFileRef.current = loadFile;
  
  useEffect(() => {
    if (!projectId || !reservedTempFiles.some((f) => f.uniqueName === uniqueName)) {
      return;
    }

    const startWatcher = async () => {
      try {
        const dataDir = await getProjectDataDir(projectId);
        if (!dataDir) return;

        const tempResult = await resolveTempFilePath(
          uniqueName,
          projectId,
          reservedTempFiles
        );
        if (!tempResult.redirected) return;

        const dirPath = tempResult.tmpPath.substring(0, tempResult.tmpPath.lastIndexOf("/"));
        const normalizedDir = await filesystem.getNormalizedPath(dirPath);
        const watcherId = await filesystem.createWatcher(normalizedDir);
        watcherIdRef.current = watcherId;

        const handler = (ev: any) => {
          const detail = ev?.detail as any;
          if (detail && detail.id === watcherId && detail.filename === uniqueName) {
            loadFileRef.current();
          }
        };

        events.on("watchFile", handler);

        return () => {
          events.off("watchFile", handler);
          filesystem.removeWatcher(watcherId);
        };
      } catch (err) {
        console.error("Failed to create file watcher:", err);
        return;
      }
    };

    startWatcher();
  }, [uniqueName, projectId]);

 

  const handleBubbleComment = useCallback((selectedText: string) => {
    if (!selectedText) {
      dismissBubble();
      return;
    }
    const normalized = selectedText.replace(/\r?\n/g, " ");
    let processed = normalized;
    if (processed.length > 200) {
      const half = Math.floor((200 - 3) / 2);
      processed = processed.slice(0, half) + "..." + processed.slice(processed.length - half);
    }
    const reText = `RE "${processed}": `;
    emit("re-comment", reText);
    dismissBubble();
  }, [emit, dismissBubble]);

  const markdown = isMarkdownFile(baseName);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.fileName}>{baseName}</span>
        <button className={styles.closeButton} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      <div className={styles.content} ref={contentContainerRef}>
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
        {bubbleData && (
          <SelectionBubble
            position={bubbleData}
            selectedText={bubbleData.text}
            onComment={handleBubbleComment}
          />
        )}
      </div>
    </div>
  );
}
