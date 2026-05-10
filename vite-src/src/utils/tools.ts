import { filesystem } from "@neutralinojs/lib";
import { ToolResult, ToolDefinition } from "../types/chat";

export interface ToolContext {
  folderPath?: string;
}

export interface ToolHandler {
  execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult>;
}

class FileSearchTool {
  private static instance: FileSearchTool;

  private constructor() {}

  static getInstance(): FileSearchTool {
    if (!FileSearchTool.instance) {
      FileSearchTool.instance = new FileSearchTool();
    }
    return FileSearchTool.instance;
  }

  private async searchDirectory(
    dirPath: string,
    query: string,
    results: Array<{ path: string; size: number }>,
    maxResults: number,
    depth: number
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

        const fullPath = `${dirPath}/${entry}`;

        if (entry.startsWith(".")) continue;

        if (entry.toLowerCase().includes(query.toLowerCase())) {
          try {
            const stat = await filesystem.getStats(fullPath);
            if (stat && !stat.isDirectory) {
              results.push({ path: fullPath, size: stat.size || 0 });
            }
          } catch {
            continue;
          }
        }
      }

      for (const entry of entriesList) {
        if (results.length >= maxResults) return true;
        if (entry.startsWith(".")) continue;

        const fullPath = `${dirPath}/${entry}`;
        try {
          const stat = await filesystem.getStats(fullPath);
          if (stat?.isDirectory) {
            const done = await this.searchDirectory(fullPath, query, results, maxResults, depth + 1);
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

  async execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult> {
    const { query, maxResults = 20 } = args as { query: string; maxResults?: number };
    const { folderPath } = context;

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

    const results: Array<{ path: string; size: number }> = [];
    const done = await this.searchDirectory(folderPath, query, results, maxResults, 0);

    if (results.length === 0) {
      return {
        callId: "",
        content: JSON.stringify({ results: [], truncated: false }),
      };
    }

    const relResults = results.map((r) => ({
      path: r.path.replace(folderPath, "").replace(/^\//, ""),
      size: r.size,
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

const toolHandlers: Record<string, ToolHandler> = {
  searchFiles: FileSearchTool.getInstance(),
};

export function getToolHandler(toolName: string): ToolHandler | undefined {
  return toolHandlers[toolName];
}

export async function executeToolCall(
  toolName: string,
  args: object,
  context: ToolContext
): Promise<ToolResult> {
  const handler = getToolHandler(toolName);
  if (!handler) {
    return {
      callId: "",
      content: `Error: Unknown tool "${toolName}"`,
      isError: true,
    };
  }
  return handler.execute(toolName, args, context);
}

export const SEARCH_FILES_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "searchFiles",
    description:
      "Searches files in the project's linked folder for names matching the given query. Returns file paths and sizes in bytes as JSON.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to match against file names and contents",
        }
      },
      required: ["query"],
    },
  },
};

export function getAvailableTools(folderPath?: string): ToolDefinition[] {
  if (!folderPath) {
    return [];
  }
  return [SEARCH_FILES_TOOL];
}
