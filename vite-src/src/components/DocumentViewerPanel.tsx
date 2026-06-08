import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { filesystem } from "../utils/electronFs";
import styles from "./DocumentViewerPanel.module.css";

interface DocumentViewerPanelProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
  searchQuery?: string;
  matchIndices?: number[];
}

function isMarkdownFile(name: string): boolean {
  if (typeof name !== "string") return false;
  const lower = name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHighlightRegex(query: string): RegExp {
  return new RegExp(`(${escapeRegex(query)})`, "gi");
}

function splitByMatch(text: string, regex: RegExp): { parts: { text: string; isMatch: boolean }[]; totalMatches: number } {
  const parts: { text: string; isMatch: boolean }[] = [];
  let lastIndex = 0;
  let matchCount = 0;
  let result: RegExpExecArray | null;

  while ((result = regex.exec(text)) !== null) {
    if (result.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, result.index), isMatch: false });
    }
    parts.push({ text: result[0], isMatch: true });
    matchCount++;
    lastIndex = result.index + result[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isMatch: false });
  }

  return { parts, totalMatches: matchCount };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function useLineHighlights(content: string | null, searchRegex: RegExp | null, lineSet: Set<number>) {
  return useMemo(() => {
    if (!content || !searchRegex) return new Map<number, { isMatched: false } | { isMatched: true; parts: { text: string; isMatch: boolean }[] }>();
    const result = new Map<number, { isMatched: false } | { isMatched: true; parts: { text: string; isMatch: boolean }[] }>();
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      if (!lineSet.has(lineNum)) {
        result.set(lineNum, { isMatched: false });
      } else {
        result.set(lineNum, { isMatched: true, parts: splitByMatch(lines[i], searchRegex).parts });
      }
    }
    return result;
  }, [content, searchRegex, lineSet]);
}

function MarkedText({ text, isCurrent }: { text: string; isCurrent: boolean }) {
  const className = [styles.searchMatch, isCurrent && styles.searchMatchCurrent].filter(Boolean).join(" ");
  return <mark className={className} data-match="true">{text}</mark>;
}

function PreContent({ rawText, currentMatchIndex, lineHighlights }: { rawText: string; currentMatchIndex: number; lineHighlights: Map<number, { isMatched: false } | { isMatched: true; parts: { text: string; isMatch: boolean }[] }> }) {
  const lines = rawText.split("\n");
  let matchCount = 0;

  return (
    <pre className={styles.textContent}>
      {lines.map((line, i) => {
        const lineNum = i + 1;
        const highlight = lineHighlights.get(lineNum);
        let el: React.ReactNode;
        if (!highlight || !highlight.isMatched) {
          el = <span key={lineNum} dangerouslySetInnerHTML={{ __html: escapeHtml(line) }} />;
        } else {
          const parts = highlight.parts;
          el = (
            <span key={lineNum}>
              {parts.map((part, j) => {
                const key = `${lineNum}:${j}`;
                if (!part.isMatch) {
                  return <span key={key} dangerouslySetInnerHTML={{ __html: escapeHtml(part.text) }} />;
                }
                const isCurrent = matchCount === currentMatchIndex;
                if (isCurrent) {
                  matchCount++;
                  return <MarkedText key={key} text={part.text} isCurrent={true} />;
                }
                matchCount++;
                return <MarkedText key={key} text={part.text} isCurrent={false} />;
              })}
            </span>
          );
        }
        if (i < lines.length - 1) {
          return (
            <span key={el.key}>
              {el}
              {"\n"}
            </span>
          );
        }
        return el;
      })}
    </pre>
  );
}

export default function DocumentViewerPanel({
  filePath,
  fileName,
  onClose,
  searchQuery,
  matchIndices,
}: DocumentViewerPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchRegex = searchQuery ? buildHighlightRegex(searchQuery) : null;
  const hasMatches = !!searchRegex && !!matchIndices && matchIndices.length > 0;

  const lineSet = useMemo(() => new Set(matchIndices || []), [matchIndices]);
  const lineHighlights = useLineHighlights(content, searchRegex, lineSet);

  const totalMatches = useMemo(() => {
    let count = 0;
    for (const entry of lineHighlights.values()) {
      if (entry.isMatched) count += entry.parts.filter(p => p.isMatch).length;
    }
    return count;
  }, [lineHighlights]);

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

  useEffect(() => {
    if (hasMatches && totalMatches > 0) {
      setCurrentMatchIndex(0);
    }
  }, [filePath, searchQuery, hasMatches, totalMatches]);

  const goNext = useCallback(() => {
    if (!hasMatches || totalMatches === 0) return;
    setCurrentMatchIndex((currentMatchIndex + 1) % totalMatches);
  }, [currentMatchIndex, hasMatches, totalMatches]);

  const goPrev = useCallback(() => {
    if (!hasMatches || totalMatches === 0) return;
    setCurrentMatchIndex((currentMatchIndex - 1 + totalMatches) % totalMatches);
  }, [currentMatchIndex, hasMatches, totalMatches]);

  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll('[data-match="true"]');
    const el = marks[currentMatchIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatchIndex]);

  const markdown = isMarkdownFile(fileName);

  const renderMarkdownContent = () => {
    if (!content) return null;
    if (!searchRegex) {
      return (
        <div className={styles.markdownContent}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content}
          </ReactMarkdown>
        </div>
      );
    }

    const MarkedTextInline = ({ text, isCurrent }: { text: string; isCurrent: boolean }) => {
      const cls = [styles.searchMatch, isCurrent && styles.searchMatchCurrent].filter(Boolean).join(" ");
      return <mark className={cls} data-match="true">{text}</mark>;
    };

    let matchCount = 0;

    const highlightedLines = [...lineHighlights.entries()].map(([lineNum, highlight]) => {
      const i = lineNum - 1;
      if (!highlight.isMatched) {
        return (
          <p key={i} dangerouslySetInnerHTML={{ __html: escapeHtml(content.split("\n")[i]) }} />
        );
      }
      const parts = highlight.parts;
      const nodes: React.ReactNode[] = [];
      for (const part of parts) {
        if (!part.isMatch) {
          nodes.push(<span key={part.text} dangerouslySetInnerHTML={{ __html: escapeHtml(part.text) }} />);
        } else {
          const isCurrent = matchCount === currentMatchIndex;
          if (isCurrent) {
            matchCount++;
            nodes.push(<MarkedTextInline key={part.text} text={part.text} isCurrent={true} />);
          } else {
            matchCount++;
            nodes.push(<MarkedTextInline key={part.text} text={part.text} isCurrent={false} />);
          }
        }
      }
      return <p key={i}>{nodes}</p>;
    });

    return (
      <div className={styles.markdownContent}>
        {highlightedLines}
      </div>
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.fileName}>{fileName}</span>
        <button className={styles.closeButton} onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>
      {hasMatches && totalMatches > 0 && (
        <div className={styles.navToolbar}>
          <button className={styles.navButton} onClick={goPrev} title="Previous match" disabled={totalMatches <= 1}>
            <ChevronUp size={14} />
          </button>
          <span className={styles.navLabel}>
            {currentMatchIndex + 1} / {totalMatches}
          </span>
          <button className={styles.navButton} onClick={goNext} title="Next match" disabled={totalMatches <= 1}>
            <ChevronDown size={14} />
          </button>
        </div>
      )}
      <div className={styles.content} ref={contentRef}>
        {error && <div className={styles.error}>{error}</div>}
        {content !== null && (
          markdown ? renderMarkdownContent() : (
            <PreContent rawText={content} currentMatchIndex={currentMatchIndex} lineHighlights={lineHighlights} />
          )
        )}
      </div>
    </div>
  );
}
