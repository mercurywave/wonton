import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { getEffectivePermission } from "./pathTools";
import { projectMetaStore } from "../store/projectMeta";
import { chatStore } from "../store/chats";
import { getProjectDataDir, TMP_DIR_NAME } from "../utils/platformUtils";
import { minimatch } from "minimatch";

export const SEARCH_CONTENTS_TOOL_NAME = "grep";

interface ContentSearchResult {
  path: string;
  size: number;
  matches: MatchInfo[];
  isTempFile?: boolean;
}

interface MatchInfo {
  line: number;
  content: string;
}

// Extensions that are always treated as text
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".xml", ".html", ".css", ".js", ".ts", ".tsx", ".jsx",
  ".py", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".rb", ".php",
  ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf", ".sh", ".bash", ".zsh",
  ".sql", ".graphql", ".vue", ".svelte", ".scala", ".kt", ".swift", ".m",
  ".lua", ".pl", ".r", ".dart", ".zig", ".nim",
]);

export class SearchContentsHandler implements ToolHandler {
  private static instance: SearchContentsHandler;

  readonly name = SEARCH_CONTENTS_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: SEARCH_CONTENTS_TOOL_NAME,
      description:
        "Searches file contents in the project's linked folder for the given text query. Returns matching file paths with line numbers and line snippets as JSON.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The text to search for inside files",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of files to return (default: 20)",
          },
          include: {
            type: "string",
            description: "Glob pattern for files to include in the search (e.g., '*.ts', 'src/**/*.{js,ts}')",
          },
          exclude: {
            type: "string",
            description: "Glob pattern for files to exclude from the search (e.g., '*.test.ts', '**/node_modules/**')",
          },
        },
        required: ["query"],
      },
    },
  };
  
  isAvailable?(folderPath?: string): boolean{
    return !!folderPath;
  }

  private constructor() {}

  static getInstance(): SearchContentsHandler {
    if (!SearchContentsHandler.instance) {
      SearchContentsHandler.instance = new SearchContentsHandler();
    }
    return SearchContentsHandler.instance;
  }

  private getExtension(filePath: string): string {
    const lastDot = filePath.lastIndexOf(".");
    if (lastDot === -1) return "";
    return filePath.slice(lastDot).toLowerCase();
  }

  private async searchFile(
    filePath: string,
    query: string,
    maxResults: number,
    results: ContentSearchResult[],
    isTempFile = false
  ): Promise<boolean> {
    try {
      const stat = await filesystem.getStats(filePath);
      if (!stat || stat.isDirectory) return false;

      // Skip files larger than 500KB
      if (stat.size > 500_000) return false;

      // Skip binary files
      if (await filesystem.isBinaryFile(filePath)) return false;

      const content = await filesystem.readFile(filePath);
      if (!content) return false;

      const lines = content.split("\n");
      const matches: MatchInfo[] = [];

      const queryLower = query.toLowerCase();
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(queryLower)) {
          matches.push({ line: i + 1, content: lines[i] });
        }
      }

      if (matches.length > 0) {
        results.push({
          path: filePath,
          size: stat.size || 0,
          matches,
          isTempFile,
        });
      }
    } catch {
      return false;
    }

    return results.length >= maxResults;
  }

  /**
   * Read stats for a batch of file paths in parallel.
   */
  private async readStatsBatch(filePaths: string[]): Promise<Map<string, import("../utils/electronFs").FsStats | null>> {
    const statsMap = new Map<string, import("../utils/electronFs").FsStats | null>();
    const promises = filePaths.map(async (fp) => {
      try {
        const stat = await filesystem.getStats(fp);
        statsMap.set(fp, stat);
      } catch {
        statsMap.set(fp, null);
      }
    });
    await Promise.all(promises);
    return statsMap;
  }

  /**
   * Check if files are binary in parallel.
   */
  private async checkBinaryBatch(filePaths: string[]): Promise<Map<string, boolean>> {
    const binaryMap = new Map<string, boolean>();
    const promises = filePaths.map(async (fp) => {
      try {
        const isBinary = await filesystem.isBinaryFile(fp);
        binaryMap.set(fp, isBinary);
      } catch {
        binaryMap.set(fp, false);
      }
    });
    await Promise.all(promises);
    return binaryMap;
  }

  /**
   * Read file contents for a batch of paths in parallel.
   */
  private async readFilesBatch(filePaths: string[]): Promise<Map<string, string>> {
    const contentMap = new Map<string, string>();
    const promises = filePaths.map(async (fp) => {
      try {
        const content = await filesystem.readFile(fp);
        if (content) {
          contentMap.set(fp, content);
        }
      } catch {
        // ignore
      }
    });
    await Promise.all(promises);
    return contentMap;
  }

  /**
   * Filter file paths by a glob pattern using minimatch.
   * Matches against the path relative to baseDir.
   * If exclude is true, files matching the pattern are excluded; otherwise they are included.
   */
  private filterByGlob(filePaths: string[], baseDir: string, pattern: string, exclude = false): string[] {
    // Normalize baseDir to use forward slashes for comparison
    const normBaseDir = baseDir.replace(/\\/g, "/");
    return filePaths.filter((fp) => {
      // Normalize fp to forward slashes and compute relative path
      const normFp = fp.replace(/\\/g, "/");
      let relPath: string;
      if (normFp.startsWith(normBaseDir + "/")) {
        relPath = normFp.slice(normBaseDir.length + 1);
      } else if (normFp === normBaseDir) {
        relPath = ".";
      } else {
        relPath = normFp;
      }
      // For simple exclude patterns like **/node_modules/**, use a direct string check
      // which is more reliable than minimatch for common exclusion patterns
      const matches = minimatch(relPath, pattern);
      return exclude ? !matches : matches;
    });
  }

  /**
   * Check if a file path should be included in the search based on extension.
   * Returns false for files with extensions that are commonly binary.
   */
  private shouldSearchFile(filePath: string): boolean {
    const ext = this.getExtension(filePath);
    // Skip common binary extensions
    const binaryExtensions = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
      ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2",
      ".exe", ".dll", ".so", ".dylib", ".o", ".a", ".lib",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
      ".woff", ".woff2", ".ttf", ".otf", ".eot",
      ".class", ".pyc", ".pyo", ".pyd", ".js.map",
      ".node", ".wasm",
    ]);

    if (binaryExtensions.has(ext)) return false;
    // If it has a known text extension, include it
    if (TEXT_EXTENSIONS.has(ext)) return true;
    // For files with unknown extensions, we'll check if they're binary later
    return true;
  }

  private async searchDirectory(
    dirPath: string,
    query: string,
    results: ContentSearchResult[],
    maxResults: number,
    depth: number,
    projectId: string | undefined,
    folderPath: string,
    include?: string,
    exclude?: string
  ): Promise<boolean> {
    if (results.length >= maxResults) {
      return true;
    }

    if (!filesystem) return false;

    try {
      const entries = await filesystem.readDirectory(dirPath);
      const entriesList: string[] = entries.map(e => e.entry);

      // Collect file and directory paths separately
      const files: string[] = [];
      const directories: { path: string; entry: string }[] = [];

      for (const entry of entriesList) {
        if (entry.startsWith(".")) continue;

        const entryRelPath = `${folderPath === dirPath ? "" : dirPath.replace(folderPath + "/", "")}${entry}`;
        const relPath = entryRelPath.startsWith("/") ? entryRelPath.slice(1) : entryRelPath;

        if (projectId) {
          const meta = projectMetaStore.getProjectMeta(projectId);
          const effectivePerm = getEffectivePermission(meta?.filePermissions, relPath, true);
          if (effectivePerm === "hidden") {
            continue;
          }
        }

        const fullPath = `${dirPath}/${entry}`;
        try {
          const stat = await filesystem.getStats(fullPath);
          if (!stat) continue;

          if (stat.isDirectory) {
            directories.push({ path: fullPath, entry });
          } else {
            files.push(fullPath);
          }
        } catch {
          continue;
        }
      }

      // Batch process files in parallel
      if (files.length > 0) {
        // First filter by extension
        let eligibleFiles = files.filter(f => this.shouldSearchFile(f));

        // Apply include glob filter (match against relative path)
        if (include) {
          eligibleFiles = this.filterByGlob(eligibleFiles, folderPath, include);
        }

        // Apply exclude glob filter (match against relative path)
        if (exclude) {
          eligibleFiles = this.filterByGlob(eligibleFiles, folderPath, exclude, true);
        }
        
        // Batch read stats for eligible files
        const statsMap = await this.readStatsBatch(eligibleFiles);

        // Filter out files that are too large
        const candidateFiles = eligibleFiles.filter(f => {
          const stat = statsMap.get(f);
          return stat && !stat.isDirectory && stat.size <= 500_000;
        });

        if (candidateFiles.length > 0) {
          // Batch check for binary files
          const binaryMap = await this.checkBinaryBatch(candidateFiles);

          // Filter out binary files
          const textFiles = candidateFiles.filter(f => !binaryMap.get(f));

          if (textFiles.length > 0) {
            // Batch read file contents
            const contentMap = await this.readFilesBatch(textFiles);

            // Search through contents
            const queryLower = query.toLowerCase();
            for (const filePath of textFiles) {
              if (results.length >= maxResults) break;

              const content = contentMap.get(filePath);
              if (!content) continue;

              const stat = statsMap.get(filePath);
              if (!stat) continue;

              const lines = content.split("\n");
              const matches: MatchInfo[] = [];

              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(queryLower)) {
                  matches.push({ line: i + 1, content: lines[i] });
                }
              }

              if (matches.length > 0) {
                results.push({
                  path: filePath,
                  size: stat.size || 0,
                  matches,
                });
              }
            }
          }
        }
      }

      // Recurse into subdirectories sequentially (can't easily parallelize directory traversal
      // due to permission checks that depend on projectId)
      for (const dir of directories) {
        if (results.length >= maxResults) break;
        const done = await this.searchDirectory(dir.path, query, results, maxResults, depth + 1, projectId, folderPath, include, exclude);
        if (done) return true;
      }
    } catch {
      return false;
    }

    return results.length >= maxResults;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { query, maxResults = 20, include, exclude } = args as { query: string; maxResults?: number; include?: string; exclude?: string };
    const { folderPath, projectId, chatId } = context;

    if (!folderPath) {
      return {
        callId: "",
        content: "Error: No folder linked to this project",
        isError: true,
      };
    }

    if (!query || query.length < 2) {
      return {
        callId: "",
        content: "Error: Query must be at least 2 characters",
        isError: true,
      };
    }

    const results: ContentSearchResult[] = [];
    const done = await this.searchDirectory(folderPath, query, results, maxResults, 0, projectId, folderPath, include, exclude);

    const reservedTempFiles = (chatId && projectId)
      ? await chatStore.getReservedTempFiles(projectId, chatId)
      : undefined;

    let dataDir: string | undefined;
    if (reservedTempFiles && reservedTempFiles.length > 0 && projectId) {
      dataDir = await getProjectDataDir(projectId);
      for (const reservation of reservedTempFiles) {
        if (results.length >= maxResults) break;
        const tmpPath = `${dataDir}/${TMP_DIR_NAME}/${reservation.uniqueName}`;
        try {
          const stat = await filesystem.getStats(tmpPath);
          if (stat && !stat.isDirectory) {
            const tempDone = await this.searchFile(tmpPath, query, maxResults, results, true);
            if (tempDone) break;
          }
        } catch {
          // temp file may not exist yet
        }
      }
    }

    // Process results: limit files with 15+ matches and add context indicators
    const relResults = results.map((r) => {
      let path: string;
      if (r.isTempFile) {
        const reservation = reservedTempFiles?.find(res => {
          const tmpPath = `${dataDir}/${TMP_DIR_NAME}/${res.uniqueName}`;
          return tmpPath === r.path;
        });
        path = reservation?.uniqueName ?? r.path;
      } else {
        path = r.path.replace(folderPath, "").replace(/^\//, "");
      }

      // If file has 15+ matches, limit to first 5 and add a note
      let matches = r.matches;
      let matchNote = "";
      if (matches.length > 15) {
        matches = matches.slice(0, 5);
        matchNote = ` [Showing 5 of ${matches.length + (r.matches.length - 5)} total matches in this file]`;
      }

      const matchesOutput = matches.map((m) => {
        const originalContent = m.content;
        
        // For long lines (>200 chars), show context around the first match on that line
        let displayContent = originalContent;
        if (originalContent.length > 200) {
          const queryLower = query.toLowerCase();
          const contentLower = originalContent.toLowerCase();
          const matchIndex = contentLower.indexOf(queryLower);
          
          if (matchIndex !== -1) {
            // Show some context before and after the match
            const contextBefore = 50;
            const contextAfter = 50;
            const start = Math.max(0, matchIndex - contextBefore);
            const end = Math.min(originalContent.length, matchIndex + query.length + contextAfter);
            
            let context = "";
            if (start > 0) {
              context += "...";
            }
            context += originalContent.slice(start, end);
            if (end < originalContent.length) {
              context += "...";
            }
            
            displayContent = `[Context around first match (${originalContent.length} chars): ${context}]`;
          }
        }

        // If there are multiple matches on this line, note it
        const matchCount = originalContent.toLowerCase().split(query.toLowerCase()).length - 1;
        if (matchCount > 1) {
          displayContent = `[First of ${matchCount} matches on this line] ${displayContent}`;
        }

        return {
          line: m.line,
          content: displayContent,
        };
      });

      // Add truncation note as a separate entry at line -1 if needed
      if (matchNote) {
        matchesOutput.unshift({
          line: -1,
          content: matchNote,
        });
      }

      return {
        path,
        size: r.size,
        matches: matchesOutput,
      };
    });

    const output = JSON.stringify({
      results: relResults,
      truncated: done,
    });

    return {
      callId: "",
      content: output,
    };
  }
}
