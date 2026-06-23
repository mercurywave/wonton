import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { getEffectivePermission } from "./pathTools";
import { projectMetaStore } from "../store/projectMeta";

export const SEARCH_FILES_TOOL_NAME = "glob";

interface SearchResult {
  path: string;
  size: number;
}

export class SearchFilesHandler implements ToolHandler {
  private static instance: SearchFilesHandler;

  readonly name = SEARCH_FILES_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: SEARCH_FILES_TOOL_NAME,
      description:
        "Searches files in the project's linked folder for names matching the given query. Returns file paths and sizes in bytes as JSON.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query supporting wildcards: * for file names, ** for recursive directories (e.g. **/*.ts, src/**/test/*)",
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

  static getInstance(): SearchFilesHandler {
    if (!SearchFilesHandler.instance) {
      SearchFilesHandler.instance = new SearchFilesHandler();
    }
    return SearchFilesHandler.instance;
  }

  private globToRegex(pattern: string): RegExp {
    let regexPattern = "";
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      if (char === "*") {
        regexPattern += "[^/]*";
        i++;
      } else if (char === "{") {
        let depth = 1;
        let j = i + 1;
        while (j < pattern.length && depth > 0) {
          if (pattern[j] === "{") depth++;
          else if (pattern[j] === "}") depth--;
          j++;
        }
        const braceContent = pattern.slice(i + 1, j - 1);
        regexPattern += "(?:" + braceContent.replace(/,/g, "|") + ")";
        i = j;
      } else if (/[.+?^$()|[\]\\]/.test(char)) {
        regexPattern += "\\" + char;
        i++;
      } else {
        regexPattern += char;
        i++;
      }
    }

    return new RegExp(`^${regexPattern}$`, "i");
  }

  private async searchDirectory(
    dirPath: string,
    patternSegments: string[],
    currentSegmentIndex: number,
    results: SearchResult[],
    maxResults: number,
    depth: number,
    projectId: string | undefined,
    folderPath: string
  ): Promise<boolean> {
    if (depth > 5 || results.length >= maxResults) {
      return results.length >= maxResults;
    }

    if (!filesystem) return false;

    if (currentSegmentIndex >= patternSegments.length) {
      return results.length >= maxResults;
    }

    try {
      const entries = await filesystem.readDirectory(dirPath);
      const entriesList: string[] = entries.map(e => e.entry);

      const currentPattern = patternSegments[currentSegmentIndex];
      const isLastPattern = currentSegmentIndex === patternSegments.length - 1;

      if (currentPattern === "**") {
        if (isLastPattern) {
          return false;
        }

        const nextPattern = patternSegments[currentSegmentIndex + 1];
        const nextRegex = this.globToRegex(nextPattern);

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
          const stat = await filesystem.getStats(fullPath);
          if (stat && nextRegex.test(entry)) {
            results.push({ path: fullPath, size: stat.size || 0 });
          }
        }

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
            if (stat?.isDirectory) {
              const done = await this.searchDirectory(
                fullPath,
                patternSegments,
                currentSegmentIndex + 1,
                results,
                maxResults,
                depth + 1,
                projectId,
                folderPath
              );
              if (done) return true;
            }
          } catch {
            continue;
          }
        }

        return results.length >= maxResults;
      }

      const entryRegex = this.globToRegex(currentPattern);

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
        if (!entryRegex.test(entry)) continue;

        try {
          const stat = await filesystem.getStats(fullPath);
          if (stat && isLastPattern) {
            results.push({ path: fullPath, size: stat.size || 0 });
          } else if (stat?.isDirectory && !isLastPattern) {
            const done = await this.searchDirectory(
              fullPath,
              patternSegments,
              currentSegmentIndex + 1,
              results,
              maxResults,
              depth + 1,
              projectId,
              folderPath
            );
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

    const patternSegments = query.includes("/") ? query.split("/") : [query];
    const results: SearchResult[] = [];
    const done = await this.searchDirectory(
      folderPath,
      patternSegments,
      0,
      results,
      maxResults,
      0,
      projectId,
      folderPath
    );

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

