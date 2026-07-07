import { useState, useMemo } from "react";
import { diffLines } from "diff";
import { Hammer, FileText, ChevronDown, ChevronRight, ArrowUpRight, Terminal } from "lucide-react";
import styles from "../components/ToolCallSection.module.css";
import { ToolCall } from "../types/chat";
import { READ_FILE_TOOL_NAME } from "../tools/readFile";
import { SEARCH_FILES_TOOL_NAME } from "../tools/searchFiles";
import { SEARCH_CONTENTS_TOOL_NAME } from "../tools/searchContents";
import { WRITE_FILE_TOOL_NAME } from "../tools/writeFile";
import { EXECUTE_SUBAGENT_TOOL_NAME } from "../tools/executeSubagent";
import { EXEC_COMMAND_TOOL_NAME } from "../tools/execCommand";
import { EDIT_FILE_TOOL_NAME } from "../tools/editFile";
import { useNav } from "../contexts/NavContext";

function parseArgs(toolCall: ToolCall): object | null {
  try {
    return JSON.parse(toolCall.arguments);
  } catch {
    return { raw: toolCall.arguments };
  }
}

function parseResult(result: string | undefined) {
  if (result == null) return { formatted: "", isJson: false, parsed: null };
  try {
    const parsed = JSON.parse(result);
    return { formatted: JSON.stringify(parsed, null, 2), isJson: true, parsed };
  } catch {
    return { formatted: result, isJson: false, parsed: null };
  }
}

function extractArgString(args: object | null, key: string): string | null {
  if (args == null || "raw" in args) return null;
  const a = args as Record<string, unknown>;
  return typeof a[key] === "string" && a[key] ? (a[key] as string) : null;
}

function formatTruncatedPath(path: string): string {
  const parts = path.split(/[\\/]/);
  if (parts.length <= 2) return path;
  return parts.slice(-2).join("\\");
}

function ToolHeader({ icon, name, pathLabel }: { icon: React.ReactNode; name: string; pathLabel: string | null }) {
  return (
    <>
      {icon}
      <span className={styles.toolCallName}>{name}</span>
      {pathLabel && <span className={styles.toolCallPath}>{pathLabel}</span>}
    </>
  );
}

function DebugSection({ args, formatted }: { args: object | null; formatted: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className={styles.debugSection}>
      <button className={styles.debugHeader} onClick={() => setIsExpanded((prev) => !prev)}>
        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Debug</span>
      </button>
      {isExpanded && (
        <div className={styles.debugBody}>
          <div className={styles.toolCallSectionLabel}>Arguments</div>
          <pre className={styles.toolCallArgs}>{JSON.stringify(args, null, 2)}</pre>
          {formatted && (
            <>
              <div className={styles.toolCallSectionLabel}>Response</div>
              <pre className={styles.toolCallResponse}>{formatted}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SubagentSection({ toolCall, result }: { toolCall: ToolCall; result?: string }) {
  const { navigateToLog } = useNav();
  const [isExpanded, setIsExpanded] = useState(false);
  const parsedArgs = useMemo(() => parseArgs(toolCall), [toolCall]);
  const parsedResult = useMemo(() => parseResult(result), [result]);

  const agentName = extractArgString(parsedArgs, "agentName");
  const query = extractArgString(parsedArgs, "query");
  const logId = toolCall.logId;

  const handleHeaderClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".subagent-debug-btn")) {
      setIsExpanded((prev) => !prev);
      return;
    }
    if (logId) {
      navigateToLog(logId);
    }
  };

  return (
    <div className={styles.toolCallSection}>
      <div className={styles.subagentSection}>
        <button className={styles.subagentHeader} onClick={handleHeaderClick}>
          <div className={styles.subagentInfo}>
            <Hammer className={styles.toolCallIcon} size={14} />
            <span className={styles.toolCallName}>{agentName || "unknown"}</span>
            {query && <span className={styles.toolCallPath}>{query}</span>}
          </div>
          <div className={styles.subagentHeaderActions}>
            <span
              className={`${styles.subagentDebugBtn} subagent-debug-btn`}
              onClick={(e) => { e.stopPropagation(); setIsExpanded((prev) => !prev); }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setIsExpanded((prev) => !prev); } }}
            >
              {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
            <ArrowUpRight className={styles.subagentLinkIcon} size={14} />
          </div>
        </button>
      </div>
      {isExpanded && (
        <div className={styles.toolCallBody}>
          <DebugSection args={parsedArgs} formatted={parsedResult.formatted} />
        </div>
      )}
    </div>
  );
}

function ExecSection({ toolCall, result }: { toolCall: ToolCall; result?: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const parsedArgs = useMemo(() => parseArgs(toolCall), [toolCall]);
  const parsedResult = useMemo(() => parseResult(result), [result]);

  const command = extractArgString(parsedArgs, "command");

  function renderExecContent() {
    if (!parsedResult.isJson || !parsedResult.parsed) {
      return parsedResult.formatted ? <pre className={styles.toolCallContent}>{parsedResult.formatted}</pre> : null;
    }

    const obj = parsedResult.parsed as Record<string, unknown>;
    const stdout = typeof obj.stdout === "string" ? obj.stdout : "";
    const stderr = typeof obj.stderr === "string" ? obj.stderr : "";
    const status = obj.status;
    const truncated = obj.truncated === true;

    const statusParts: string[] = [];
    if (status !== null && status !== undefined) {
      statusParts.push(`Exit code: ${status}`);
    }
    if (truncated) {
      statusParts.push("(truncated)");
    }
    const statusText = statusParts.join(" ");

    return (
      <div>
        {stdout && <pre className={styles.toolCallContent}>{stdout}</pre>}
        {stderr && (
          <pre className={styles.toolCallContent} style={{ borderTopColor: "#5a3e00", marginTop: stdout ? "8px" : "0" }}>
            {stderr}
          </pre>
        )}
        {statusText && (
          <div className={styles.toolCallSectionLabel} style={{ marginTop: "4px", display: "flex", gap: "12px" }}>
            <span>{statusText}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={styles.toolCallSection}>
      <button className={styles.toolCallHeader} onClick={() => setIsExpanded((prev) => !prev)}>
        <ToolHeader icon={<Terminal className={styles.toolCallIcon} size={14} />} name="Exec" pathLabel={command ? `"${command}"` : null} />
        {isExpanded ? <ChevronDown className={styles.toolCallArrow} size={12} /> : <ChevronRight className={styles.toolCallArrow} size={12} />}
      </button>
      {isExpanded && (
        <div className={styles.toolCallBody}>
          {renderExecContent()}
          <DebugSection args={parsedArgs} formatted={parsedResult.formatted} />
        </div>
      )}
    </div>
  );
}

interface ToolConfig {
  header: (parsedArgs: object | null) => React.ReactNode;
  content: (parsedArgs: object | null, parsedResult: { formatted: string; isJson: boolean; parsed: Record<string, unknown> | null }) => React.ReactNode;
}

const toolConfigs: Record<string, ToolConfig> = {
  [READ_FILE_TOOL_NAME]: {
    header: (parsedArgs) => {
      const path = extractArgString(parsedArgs, "filePath") ?? extractArgString(parsedArgs, "path");
      return <ToolHeader icon={<FileText className={styles.toolCallIcon} size={14} />} name="Read" pathLabel={path ? formatTruncatedPath(path) : null} />;
    },
    content: (_parsedArgs, parsedResult) => {
      const result = parsedResult.formatted;
      const isBinary = result.includes("<type>binary</type>");
      if (isBinary) {
        return <div className={styles.binaryNotice}>Binary file - content not displayed</div>;
      }
      if (parsedResult.isJson && parsedResult.parsed) {
        if (typeof parsedResult.parsed.content === "string" && parsedResult.parsed.content) {
          return <pre className={styles.toolCallContent}>{parsedResult.parsed.content}</pre>;
        }
      }
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
  [WRITE_FILE_TOOL_NAME]: {
    header: (parsedArgs) => {
      const path = extractArgString(parsedArgs, "filePath") ?? extractArgString(parsedArgs, "path");
      return <ToolHeader icon={<FileText className={styles.toolCallIcon} size={14} />} name="Write" pathLabel={path ? formatTruncatedPath(path) : null} />;
    },
    content: (_parsedArgs, parsedResult) => {
      const result = parsedResult.formatted;
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
  [SEARCH_CONTENTS_TOOL_NAME]: {
    header: (parsedArgs) => {
      const query = extractArgString(parsedArgs, "query");
      return <ToolHeader icon={<FileText className={styles.toolCallIcon} size={14} />} name="Grep" pathLabel={query ? `"${query}"` : null} />;
    },
    content: (_parsedArgs, parsedResult) => {
      const result = parsedResult.formatted;
      if (parsedResult.isJson && parsedResult.parsed) {
        const obj = parsedResult.parsed as Record<string, unknown>;
        if (Array.isArray(obj.results)) {
          const results = obj.results as Array<Record<string, unknown>>;
          return (
            <ResultsTable results={results} truncated={obj.truncated === true} />
          );
        }
      }
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
  [SEARCH_FILES_TOOL_NAME]: {
    header: (parsedArgs) => {
      const query = extractArgString(parsedArgs, "query");
      return <ToolHeader icon={<FileText className={styles.toolCallIcon} size={14} />} name="Glob" pathLabel={query ? `"${query}"` : null} />;
    },
    content: (_parsedArgs, parsedResult) => {
      const result = parsedResult.formatted;
      if (parsedResult.isJson && parsedResult.parsed) {
        const obj = parsedResult.parsed as Record<string, unknown>;
        if (Array.isArray(obj.results)) {
          const results = obj.results as Array<Record<string, unknown>>;
          return (
            <ResultsTable results={results} truncated={obj.truncated === true} />
          );
        }
      }
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
  [EDIT_FILE_TOOL_NAME]: {
    header: (parsedArgs) => {
      const path = extractArgString(parsedArgs, "path");
      return <ToolHeader icon={<FileText className={styles.toolCallIcon} size={14} />} name="Edit" pathLabel={path ? formatTruncatedPath(path) : null} />;
    },
    content: (parsedArgs, parsedResult) => {
      if (parsedArgs && !("raw" in parsedArgs)) {
        const args = parsedArgs as { path?: string; edits?: { oldText: string; newText: string }[] };
        if (args.edits && args.edits.length > 0) {
          const allChanges: { text: string; added?: boolean; removed?: boolean }[] = [];
          for (const edit of args.edits) {
            if (edit.oldText === edit.newText) continue;
            const changes = diffLines(edit.oldText, edit.newText, { newlineIsToken: true });
            for (const change of changes) {
              if (change.added) {
                allChanges.push({ text: change.value, added: true });
              } else if (change.removed) {
                allChanges.push({ text: change.value, removed: true });
              } else {
                allChanges.push({ text: change.value });
              }
            }
          }
          if (allChanges.length > 0) {
            return (
              <div className={styles.toolCallContent} style={{ whiteSpace: "pre-wrap", maxHeight: "500px" }}>
                {allChanges.map((change, i) => (
                  <span
                    key={i}
                    className={change.added ? styles.diffAdded : change.removed ? styles.diffRemoved : undefined}
                  >
                    {change.text}
                  </span>
                ))}
              </div>
            );
          }
        }
      }
      const result = parsedResult.formatted;
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
  [EXEC_COMMAND_TOOL_NAME]: {
    header: (parsedArgs) => {
      const command = extractArgString(parsedArgs, "command");
      return <ToolHeader icon={<Terminal className={styles.toolCallIcon} size={14} />} name="Exec" pathLabel={command ? `"${command}"` : null} />;
    },
    content: () => null,
  },
};

function ResultsTable({ results, truncated }: { results: Array<Record<string, unknown>>; truncated?: boolean }) {
  const columns = useMemo(() => {
    const keys = new Set<string>();
    for (const r of results) {
      for (const k of Object.keys(r)) {
        keys.add(k);
      }
    }
    const ordered: string[] = [];
    for (const k of ["path", "size", "matches", ...Array.from(keys)]) {
      if (keys.has(k) && !ordered.includes(k)) ordered.push(k);
    }
    return ordered;
  }, [results]);

  function formatCellValue(val: unknown): React.ReactNode {
    if (Array.isArray(val)) {
      const allMatches = val.every(
        (item): item is { line: number; content: string } =>
          item !== null && typeof item === "object" && "line" in item && "content" in item
      );
      if (allMatches) {
        return (
          <div className={styles.matchList}>
            {val.map((item, j) => {
              const m = item as { line: number; content: string };
              return (
                <div key={j}>
                  <span className={styles.matchLine}>{m.line}</span>
                  <span className={styles.matchContent}>: {m.content}</span>
                </div>
              );
            })}
          </div>
        );
      }
      return (
        <div className={styles.otherArray}>
          {val.map((item, j) => (
            <div key={j}>{typeof item === "string" ? item : JSON.stringify(item)}</div>
          ))}
        </div>
      );
    }
    if (typeof val === "string") return val;
    return JSON.stringify(val);
  }

  return (
    <div>
      <table className={styles.resultsTable}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col} className={styles.resultsTh}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => (
            <tr key={i} className={styles.resultsTr}>
              {columns.map((col) => {
                const val = row[col];
                return <td key={col} className={styles.resultsTd}>{formatCellValue(val)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {truncated && <div className={styles.resultsTruncated}>⚠ Results truncated</div>}
    </div>
  );
}

export default function ToolCallSection({ toolCall, result }: { toolCall: ToolCall; result?: string }) {
  if (toolCall.name === EXECUTE_SUBAGENT_TOOL_NAME) {
    return <SubagentSection toolCall={toolCall} result={result} />;
  }
  if (toolCall.name === EXEC_COMMAND_TOOL_NAME) {
    return <ExecSection toolCall={toolCall} result={result} />;
  }

  const [isExpanded, setIsExpanded] = useState(false);
  const parsedArgs = useMemo(() => parseArgs(toolCall), [toolCall]);
  const parsedResult = useMemo(() => parseResult(result), [result]);

  const config = toolConfigs[toolCall.name] ?? {
    header: () => <ToolHeader icon={<Hammer className={styles.toolCallIcon} size={14} />} name={toolCall.name} pathLabel={null} />,
    content: () => null,
  };

  return (
    <div className={styles.toolCallSection}>
      <button className={styles.toolCallHeader} onClick={() => setIsExpanded((prev) => !prev)}>
        {config.header(parsedArgs)}
        {isExpanded ? <ChevronDown className={styles.toolCallArrow} size={12} /> : <ChevronRight className={styles.toolCallArrow} size={12} />}
      </button>
      {isExpanded && (
        <div className={styles.toolCallBody}>
          {config.content(parsedArgs, parsedResult)}
          <DebugSection args={parsedArgs} formatted={parsedResult.formatted} />
        </div>
      )}
    </div>
  );
}
