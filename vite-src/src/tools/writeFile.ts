import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { sanitizeAndResolvePath } from "./pathTools";
import { resolveTempFilePath } from "../utils/platformUtils";
import { chatStore } from "../store/chats";

export const WRITE_FILE_TOOL_NAME = "write";

export class WriteFileHandler implements ToolHandler {
  private static instance: WriteFileHandler;

  readonly name = WRITE_FILE_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: WRITE_FILE_TOOL_NAME,
      description:
        "Writes content to a file. Can create a new file, overwrite an existing file. Use edit tools for targetted edits instead",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative or absolute path to the file to write",
          },
          content: {
            type: "string",
            description: "The content to write to the file",
          },
        },
        required: ["path", "content"],
      },
    },
  };
  
  isAvailable?(folderPath?: string): boolean{
    return !!folderPath;
  }

  private constructor() {}

  static getInstance(): WriteFileHandler {
    if (!WriteFileHandler.instance) {
      WriteFileHandler.instance = new WriteFileHandler();
    }
    return WriteFileHandler.instance;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { path, content } = args as { path: string; content: string | null };
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

    if (content === null || content === undefined) {
      return {
        callId: "",
        content: "Error: Content is required",
        isError: true,
      };
    }

    // Check if this path matches a reserved temp file
    const reservedTempFiles = chatId && projectId
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

    try {
      // Write content to file
      await filesystem.writeFile(fullPath, content);

      const stat = await filesystem.getStats(fullPath);

      return {
        callId: "",
        content: JSON.stringify({
          path: responsePath,
          operation: "write",
          success: true,
          size: stat?.size || 0,
        }),
      };
    } catch (err) {
      return {
        callId: "",
        content: `Error writing file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
