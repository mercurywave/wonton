import { useState, useEffect, useCallback } from "react";
import { Book, FolderOpen, Search, FileText, Loader2 } from "lucide-react";
import { filesystem } from "@neutralinojs/lib";
import { os } from "@neutralinojs/lib";
import styles from "./ReferencesPage.module.css";
import SplitPanel from "./SplitPanel";
import DocumentViewerPanel from "./DocumentViewerPanel";
import { useNav } from "../contexts";
import { isNeutralinoConnected, isWindows, getProjectDataDir, DOCS_DIR_NAME } from "../utils/neuUtils";
import { ReferenceSearchResult, ReferenceMatch, getCache, setQuery, setResults, setSelectedFilePath, clearOnProjectChange } from "../store/references";

function normalizePath(p: string): string {
  return p.replace(/\//g, "\\");
}

const contextLines = 2;
const maxResults = 50;
const maxFileSize = 500_000;
const maxDepth = 8;

const TRUNCATE_LINE = 50;
const TRUNCATE_MATCH = 200;
const CONTEXT_HALF = 75;
const MULTI_PAD = 25;

function truncateContextLine(line: string): string {
  if (line.length <= CONTEXT_HALF * 2) return line;
  return line.slice(0, CONTEXT_HALF) + "..." + line.slice(-CONTEXT_HALF);
}

function truncateMatchLine(line: string, query: string): string {
  if (line.length <= TRUNCATE_MATCH) return line;

  const q = query.toLowerCase();
  const lower = line.toLowerCase();
  const indices: number[] = [];
  let idx = 0;
  while (idx < lower.length) {
    const found = lower.indexOf(q, idx);
    if (found === -1) break;
    indices.push(found);
    idx = found + 1;
  }

  if (indices.length === 0) {
    return line.slice(0, TRUNCATE_MATCH) + "...";
  }

  const ranges: [number, number][] = [];
  for (const i of indices) {
    const start = Math.max(0, i - MULTI_PAD);
    const end = Math.min(line.length, i + query.length + MULTI_PAD);
    ranges.push([start, end]);
  }

  ranges.sort((a, b) => a[0] - b[0]);

  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1]) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push([...ranges[i]] as [number, number]);
    }
  }

  const parts: string[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor + 1) {
      parts.push("...");
    }
    parts.push(line.slice(start, end));
    cursor = end;
  }
  if (cursor < line.length) {
    parts.push("...");
  }

  return parts.join("");
}

function buildMatches(content: string, query: string): ReferenceMatch[] {
  const q = query.toLowerCase();
  const lines = content.split("\n");
  const matches: ReferenceMatch[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (matches.length >= 30) break;
    if (!lines[i].toLowerCase().includes(q)) continue;

    const before: string[] = [];
    const after: string[] = [];
    
    if(lines[i].length < TRUNCATE_LINE){
      for (let b = Math.max(0, i - contextLines); b < i; b++) {
        before.push(lines[b].length <= TRUNCATE_LINE ? lines[b] : truncateContextLine(lines[b]));
      }
      for (let a = i + 1; a < Math.min(lines.length, i + 1 + contextLines); a++) {
        after.push(lines[a].length <= TRUNCATE_LINE ? lines[a] : truncateContextLine(lines[a]));
      }
    }
      
    const lineContent = lines[i].length <= TRUNCATE_LINE
      ? lines[i]
      : truncateMatchLine(lines[i], query);

    matches.push({ line: i + 1, content: lineContent, contextBefore: before, contextAfter: after });
  }
  return matches;
}

async function searchDocs(docsDir: string, query: string): Promise<ReferenceSearchResult[]> {
  const results: ReferenceSearchResult[] = [];
  const q = query.toLowerCase();

  async function walk(dir: string, depth: number): Promise<boolean> {
    if (depth > maxDepth || results.length >= maxResults) return results.length >= maxResults;
    try {
      const entries = await filesystem.readDirectory(dir);
      for (const entry of entries) {
        if (results.length >= maxResults) return true;
        if (entry.entry.startsWith(".")) continue;
        const fullPath = `${dir}/${entry.entry}`;
        try {
          const stat = await filesystem.getStats(fullPath);
          if (!stat) continue;
          if (stat.isDirectory) {
            const done = await walk(fullPath, depth + 1);
            if (done) return true;
          } else if (stat.size <= maxFileSize) {
            const content = await filesystem.readFile(fullPath);
            if (!content) continue;
            const lower = content.toLowerCase();
            if (!lower.includes(q)) continue;
            const matches = buildMatches(content, query);
            if (matches.length > 0) {
              const relPath = fullPath.replace(docsDir, "").replace(/^\//, "");
              results.push({ path: relPath, size: stat.size || 0, matches });
            }
          }
        } catch { continue; }
      }
    } catch { return false; }
    return results.length >= maxResults;
  }

  await walk(docsDir, 0);
  return results;
}

export default function ReferencesPage() {
  const { activeProjectId } = useNav();
  const [searchInput, setSearchInput] = useState("");
  const [results, setResultsState] = useState<ReferenceSearchResult[]>([]);
  const [selectedFile, setSelectedFileState] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [searching, setSearching] = useState(false);
  const [docsPath, setDocsPath] = useState<string | null>(null);
  const windowsOnly = isWindows();

  // Restore cached state on mount / project switch
  useEffect(() => {
    if (!activeProjectId) return;
    clearOnProjectChange(activeProjectId);
    const cache = getCache();
    setSearchInput(cache.query);
    setResultsState(cache.results);
    setSelectedFileState(cache.selectedFilePath);
    if (cache.selectedFilePath) {
      setSelectedFileName(cache.selectedFilePath.split("/").pop() || cache.selectedFilePath);
    } else {
      setSelectedFileName("");
    }
  }, [activeProjectId]);

  // Resolve docs path
  useEffect(() => {
    if (!activeProjectId) return;
    (async () => {
      try {
        const projectDir = await getProjectDataDir(activeProjectId);
        if (projectDir) {
          const dPath = `${projectDir}/${DOCS_DIR_NAME}`;
          setDocsPath(dPath);
          try { await filesystem.getStats(dPath); } catch {
            try { await filesystem.createDirectory(dPath); } catch {}
          }
        }
      } catch {}
    })();
  }, [activeProjectId]);

  const handleSearch = useCallback(async () => {
    const q = searchInput.trim();
    if (!q || !docsPath) {
      setResultsState([]);
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchDocs(docsPath, q);
      setResultsState(res);
      setResults(res);
      setQuery(q);
    } finally {
      setSearching(false);
    }
  }, [searchInput, docsPath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  };

  const handleOpenFolder = async () => {
    if (!isNeutralinoConnected() || !docsPath) return;
    try {
      await os.execCommand(`explorer "${normalizePath(docsPath)}"`)
    } catch (err) {
      console.error("handleOpenFolder: failed to open docs folder", err);
    }
  };

  const handleSelectFile = (resultPath: string) => {
    const fullPath = docsPath ? `${docsPath}/${resultPath}` : "";
    const name = resultPath.split("/").pop() || resultPath;
    setSelectedFileState(fullPath);
    setSelectedFileName(name);
    setSelectedFilePath(fullPath);
  };

  const handleCloseViewer = () => {
    setSelectedFileState(null);
    setSelectedFileName("");
    setSelectedFilePath(null);
  };

  const showSplit = !!selectedFile;

  const currentFileMatches = results.find((r) => {
    if (!docsPath) return false;
    const fullPath = `${docsPath}/${r.path}`;
    return normalizePath(fullPath) === normalizePath(selectedFile || "");
  });

  const matchLineIndices = currentFileMatches
    ? currentFileMatches.matches.map((m) => m.line)
    : [];

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <Book size={20} />
          <h2>References</h2>
        </div>
        <div className={styles.searchRow}>
          <Search size={16} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="text"
            placeholder="Search references..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {searching ? (
            <Loader2 size={16} className={styles.spinner} />
          ) : (
            <button
              className={styles.searchBtn}
              onClick={handleSearch}
              type="button"
              title="Search"
            >
              <Search size={14} />
            </button>
          )}
        </div>
        <div className={styles.topBarRight}>
          {windowsOnly && docsPath && (
            <button
              className={styles.openFolderBtn}
              onClick={handleOpenFolder}
              type="button"
              title="Open docs folder"
            >
              <FolderOpen size={14} />
              <span>Open Folder</span>
            </button>
          )}
        </div>
      </div>
      <div className={styles.body}>
        {showSplit ? (
          <SplitPanel
            leftChild={<ResultsList results={results} query={searchInput.trim()} onSelectFile={handleSelectFile} />}
            rightChild={
              <DocumentViewerPanel
                filePath={selectedFile}
                fileName={selectedFileName}
                onClose={handleCloseViewer}
                searchQuery={searchInput.trim()}
                matchIndices={matchLineIndices}
              />
            }
            initialRatio={0.45}
            leftMinWidth={250}
            rightMinWidth={300}
          />
        ) : (
          <ResultsList results={results} query={searchInput.trim()} onSelectFile={handleSelectFile} />
        )}
      </div>
    </div>
  );
}

interface ResultsListProps {
  results: ReferenceSearchResult[];
  query: string;
  onSelectFile: (path: string) => void;
}

function ResultsList({ results, query, onSelectFile }: ResultsListProps) {
  if (!query) {
    return (
      <div className={styles.empty}>
        <FileText size={32} className={styles.emptyIcon} />
        <p>Type a query and press Search to find references.</p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No results found.</p>
      </div>
    );
  }

  return (
    <div className={styles.fullResults}>
      <div className={styles.resultsList}>
        {results.map((r) => {
          const fullPath = r.path;
          return (
              <div
                key={fullPath}
                className={styles.resultCard}
                onClick={() => onSelectFile(fullPath)}
              >
                <div className={styles.resultPath}>{r.path}</div>
                {r.matches.map((m, mi) => (
                  <div key={mi} className={styles.matchBlock}>
                    {m.contextBefore.map((line, i) => (
                      <div key={i} className={styles.contextLine}>{line}</div>
                    ))}
                    <div className={styles.matchLine}>
                      <span className={styles.lineNumber}>{m.line}</span>
                      <span dangerouslySetInnerHTML={{ __html: highlightMatch(m.content, query) }} />
                    </div>
                    {m.contextAfter.map((line, i) => (
                      <div key={i} className={styles.contextLine}>{line}</div>
                    ))}
                  </div>
                ))}
              </div>
          );
        })}
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const escaped = escapeHtml(text);
  const escapedQuery = escapeHtml(query);
  const regex = new RegExp(`(${escapeRegex(escapedQuery)})`, "gi");
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
