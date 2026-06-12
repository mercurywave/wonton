import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { truncateContent } from "./truncationTools";

export const EXEC_COMMAND_TOOL_NAME = "exec";

const MAX_LINES = 200;
const MAX_BYTES = 50 * 256;

interface ExecResult {
  stdout: string;
  stderr: string;
  status: number | null;
  truncated: boolean;
}

export class ExecCommandHandler implements ToolHandler {
  private static instance: ExecCommandHandler;

  readonly name = EXEC_COMMAND_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: EXEC_COMMAND_TOOL_NAME,
      description:
        "Executes a shell command on the system within the project's folder. Returns stdout, stderr, exit status, and truncation info as JSON.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The shell command to execute",
          },
        },
        required: ["command"],
      },
    },
  };

  private constructor() {}

  static getInstance(): ExecCommandHandler {
    if (!ExecCommandHandler.instance) {
      ExecCommandHandler.instance = new ExecCommandHandler();
    }
    return ExecCommandHandler.instance;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { command } = args as { command: string };
    const { folderPath } = context;

    if (!folderPath) {
      return {
        callId: "",
        content: "Error: No folder linked to this project",
        isError: true,
      };
    }

    if (!command || command.length < 1) {
      return {
        callId: "",
        content: "Error: Command is required",
        isError: true,
      };
    }

   let result: { stdout: string; stderr: string; status: number | null; signal?: string; killed?: boolean };
    try {
      result = await window.electronAPI.os.execCommand(command, folderPath);
    } catch (err) {
      return {
        callId: "",
        content: `Error executing command: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }

    const stdoutTruncated = truncateContent(result.stdout, MAX_LINES, MAX_BYTES);
    const stderrTruncated = truncateContent(result.stderr, MAX_LINES, MAX_BYTES);

    const output: ExecResult = {
      stdout: stdoutTruncated.content,
      stderr: stderrTruncated.content,
      status: result.status,
      truncated: stdoutTruncated.wasTruncated || stderrTruncated.wasTruncated,
    };

    if (stdoutTruncated.wasTruncated) {
      output.stdout += `\n\n// [stdout truncated: ${stdoutTruncated.originalLines} lines -> ${stdoutTruncated.returnedLines} lines]`;
    }
    if (stderrTruncated.wasTruncated) {
      output.stderr += `\n\n// [stderr truncated: ${stderrTruncated.originalLines} lines -> ${stderrTruncated.returnedLines} lines]`;
    }

    return {
      callId: "",
      content: JSON.stringify(output),
    };
  }
}
