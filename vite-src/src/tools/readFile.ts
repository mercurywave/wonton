import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { truncateContent } from "./truncationTools";
import { sanitizeAndResolvePath, getEffectivePermission } from "./pathTools";
import { resolveTempFilePath } from "../utils/platformUtils";
import { chatStore } from "../store/chats";
import { projectMetaStore } from "../store/projectMeta";

export const READ_FILE_TOOL_NAME = "read";

const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024; // 50KB

export class ReadFileHandler implements ToolHandler {
  private static instance: ReadFileHandler;

  readonly name = READ_FILE_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: READ_FILE_TOOL_NAME,
      description:
        "Reads contents of a specific file in the project's linked folder. Can read full file or a range of lines. Returns the file path, size, content, and line metadata as JSON.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative or absolute path to the file to read",
          },
          offset: {
            type: "number",
            description: "The 1-based line number to start reading from (optional, defaults to 1)",
          },
          limit: {
            type: "number",
            description: "The maximum number of lines to read (optional, defaults to all lines)",
          },
        },
        required: ["path"],
      },
    },
  };

  isAvailable?(folderPath?: string): boolean{
    return !!folderPath;
  }

  private constructor() {}

  static getInstance(): ReadFileHandler {
    if (!ReadFileHandler.instance) {
      ReadFileHandler.instance = new ReadFileHandler();
    }
    return ReadFileHandler.instance;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { path, offset: offsetArg, limit: limitArg } = args as { 
      path: string; 
      offset?: number; 
      limit?: number; 
    };
    const { folderPath, projectId, chatId } = context;

    if (!folderPath) {
      return {
        callId: "",
        content: "Error: No folder linked to this project",
        isError: true,
      };
    }

    if (!path || path.length < 1) {
      return {
        callId: "",
        content: "Error: File path is required",
        isError: true,
      };
    }

    // Parse offset and limit with defaults
    const offset = offsetArg && offsetArg > 0 ? offsetArg : 1;
    const limit = limitArg && limitArg > 0 ? limitArg : undefined;

    // Check if this path matches a reserved temp file
    const reservedTempFiles = (chatId && projectId)
      ? await chatStore.getReservedTempFiles(projectId, chatId)
      : undefined;
    const tempResult = await resolveTempFilePath(path, projectId, reservedTempFiles);

    let fullPath: string;
    let responsePath: string;
    if (tempResult.redirected) {
      fullPath = tempResult.tmpPath;
      responsePath = tempResult.virtualPath;
    } else {
      // Sanitize and resolve path
      const sanitized = await sanitizeAndResolvePath(folderPath, path);
      if (!sanitized.success) {
        return {
          callId: "",
          content: `Error: ${sanitized.error}`,
          isError: true,
        };
      }
      fullPath = sanitized.resolvedPath!;
      responsePath = sanitized.relativePath!;
    }

    // Check file permissions
    if (projectId && !tempResult.redirected) {
      const meta = projectMetaStore.getProjectMeta(projectId);
      const effectivePerm = getEffectivePermission(meta?.filePermissions, responsePath, false);
      if (effectivePerm === "hidden") {
        return {
          callId: "",
          content: `Error: File is hidden and cannot be accessed: ${responsePath}`,
          isError: true,
        };
      }
    }

    try {
      const stat = await filesystem.getStats(fullPath);
      if (!stat) {
        return {
          callId: "",
          content: `Error: File not found: ${responsePath}`,
          isError: true,
        };
      }

      if (stat.isDirectory) {
        return {
          callId: "",
          content: `Error: Path is a directory, not a file: ${responsePath}`,
          isError: true,
        };
      }

      // Read the full file content first
      const content = await filesystem.readFile(fullPath);
      if (!content) {
        return {
          callId: "",
          content: `Error: Could not read file: ${responsePath}`,
          isError: true,
        };
      }

      // Split into lines
      const lines = content.split("\n");
      const totalLines = lines.length;

      // Apply offset and limit
      const startLine = Math.min(offset, totalLines);
      const endLine = limit ? Math.min(startLine + limit - 1, totalLines) : totalLines;

      // Check if offset is beyond file
      if (startLine > totalLines) {
        const result: Record<string, unknown> = {
          path: responsePath,
          size: stat.size || 0,
          content: `// Offset ${offset} is beyond the end of the file (${totalLines} lines)`,
          totalLines,
          linesReturned: 0,
        };
        return {
          callId: "",
          content: JSON.stringify(result),
        };
      }

      const selectedLines = lines.slice(startLine - 1, endLine);
      const selectedContent = selectedLines.join("\n");

      // Apply truncation limits (max lines and max bytes)
      const truncated = truncateContent(selectedContent, MAX_LINES, MAX_BYTES);

      const result: Record<string, unknown> = {
        path: responsePath,
        size: stat.size || 0,
        content: truncated.content,
        totalLines,
        linesReturned: truncated.returnedLines,
      };

      if (truncated.wasTruncated) {
        result.wasTruncated = true;
        result.truncationReason = truncated.truncationReason;
      }

      return {
        callId: "",
        content: JSON.stringify(result),
      };
    } catch (err) {
      return {
        callId: "",
        content: `Error reading file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
