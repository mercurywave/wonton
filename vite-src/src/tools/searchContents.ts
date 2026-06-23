import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { getEffectivePermission } from "./pathTools";
import { projectMetaStore } from "../store/projectMeta";

export const SEARCH_CONTENTS_TOOL_NAME = "grep";

interface ContentSearchResult {
  path: string;
  size: number;
  matches: MatchInfo[];
}

interface MatchInfo {
  line: number;
  content: string;
}

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

  private async searchFile(
    filePath: string,
    query: string,
    maxResults: number,
    results: ContentSearchResult[]
  ): Promise<boolean> {
    try {
      const stat = await filesystem.getStats(filePath);
      if (!stat || stat.isDirectory) return false;

      if (stat.size > 500_000) return false;

      const content = await filesystem.readFile(filePath);
      if (!content) return false;

      const lines = content.split("\n");
      const matches: MatchInfo[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= maxResults * 3) break;
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
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
    } catch {
      return false;
    }

    return results.length >= maxResults;
  }

  private async searchDirectory(
    dirPath: string,
    query: string,
    results: ContentSearchResult[],
    maxResults: number,
    depth: number,
    projectId: string | undefined,
    folderPath: string
  ): Promise<boolean> {
    if (depth > 5 || results.length >= maxResults) {
      return results.length >= maxResults;
    }

    if (!filesystem) return false;

    try {
      const entries = await filesystem.readDirectory(dirPath);
      const entriesList: string[] = entries.map(e => e.entry);

      for (const entry of entriesList) {
        if (results.length >= maxResults) return true;
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
            const done = await this.searchDirectory(fullPath, query, results, maxResults, depth + 1, projectId, folderPath);
            if (done) return true;
          } else {
            const done = await this.searchFile(fullPath, query, maxResults, results);
            if (done) return true;
          }
        } catch {
          continue;
        }
      }
    } catch {
      return false;
    }

    return results.length >= maxResults;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { query, maxResults = 20 } = args as { query: string; maxResults?: number };
    const { folderPath, projectId } = context;

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
    const done = await this.searchDirectory(folderPath, query, results, maxResults, 0, projectId, folderPath);

    const relResults = results.map((r) => ({
      path: r.path.replace(folderPath, "").replace(/^\//, ""),
      size: r.size,
      matches: r.matches.map((m) => ({
        line: m.line,
        content: m.content,
      })),
    }));

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
