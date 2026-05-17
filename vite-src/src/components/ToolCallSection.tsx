import { useState, useMemo } from "react";
import { Hammer, FileText, ChevronDown, ChevronRight } from "lucide-react";
import styles from "../components/ToolCallSection.module.css";
import { ToolCall } from "../types/chat";
import { READ_FILE_TOOL_NAME } from "../tools/readFile";
import { SEARCH_FILES_TOOL_NAME } from "../tools/searchFiles";
import { SEARCH_CONTENTS_TOOL_NAME } from "../tools/searchContents";
import { WRITE_FILE_TOOL_NAME } from "../tools/writeFile";

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
      return result ? <pre className={styles.toolCallContent}>{result}</pre> : null;
    },
  },
};

export default function ToolCallSection({ toolCall, result }: { toolCall: ToolCall; result?: string }) {
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
