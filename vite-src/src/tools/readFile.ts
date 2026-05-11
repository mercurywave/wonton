import { filesystem } from "@neutralinojs/lib";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";

export const READ_FILE_TOOL_NAME = "read";

interface ReadFileResult {
  path: string;
  size: number;
  content: string;
}

export class ReadFileHandler implements ToolHandler {
  private static instance: ReadFileHandler;

  readonly name = READ_FILE_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: READ_FILE_TOOL_NAME,
      description:
        "Reads the full contents of a specific file in the project's linked folder. Returns the file path, size, and content as JSON.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The relative or absolute path to the file to read",
          },
        },
        required: ["path"],
      },
    },
  };

  private constructor() {}

  static getInstance(): ReadFileHandler {
    if (!ReadFileHandler.instance) {
      ReadFileHandler.instance = new ReadFileHandler();
    }
    return ReadFileHandler.instance;
  }

  async execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult> {
    const { path } = args as { path: string };
    const { folderPath } = context;

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

    const fullPath = path.startsWith("/") ? path : `${folderPath}/${path}`;

    try {
      const stat = await filesystem.getStats(fullPath);
      if (!stat) {
        return {
          callId: "",
          content: `Error: File not found: ${path}`,
          isError: true,
        };
      }

      if (stat.isDirectory) {
        return {
          callId: "",
          content: `Error: Path is a directory, not a file: ${path}`,
          isError: true,
        };
      }

      if (stat.size > 500_000) {
        return {
          callId: "",
          content: `Error: File too large (${stat.size} bytes). Maximum allowed is 500000 bytes.`,
          isError: true,
        };
      }

      const content = await filesystem.readFile(fullPath);
      if (!content) {
        return {
          callId: "",
          content: `Error: Could not read file: ${path}`,
          isError: true,
        };
      }

      const relPath = path.replace(/^\//, "");

      const result: ReadFileResult = {
        path: relPath,
        size: stat.size || 0,
        content,
      };

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
