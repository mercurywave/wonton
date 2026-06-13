import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { FeedbackPayload } from "../contexts";
import { truncateContent } from "./truncationTools";
import { getPlatform } from "../utils/platformUtils";

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

  async getDynamicDefinition(): Promise<ToolDefinition> {
    const platform = await getPlatform();
    const platformName = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : platform === "linux" ? "Linux" : platform;
    const definition = JSON.parse(JSON.stringify(this.definition)) as ToolDefinition;
    (definition.function as any).description = `Executes a shell command on the system within the project's folder (Running on ${platformName}). Returns stdout, stderr, exit status, and truncation info as JSON.`;
    return definition;
  }

  static getInstance(): ExecCommandHandler {
    if (!ExecCommandHandler.instance) {
      ExecCommandHandler.instance = new ExecCommandHandler();
    }
    return ExecCommandHandler.instance;
  }

  async execute(args: object, context: ToolContext, _toolCall: any): Promise<ToolResult> {
    const { command } = args as { command: string };
    const { folderPath, showFeedback, projectId, chatId, logId } = context;

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

    if (showFeedback && projectId && chatId && logId) {
      const result: ToolResult = { callId: "", content: "", isError: false };
      try {
        const choice = await showFeedback(
          projectId,
          chatId,
          logId,
          {
            type: "select",
            question: `The agent wants to run:\n\`\`\`\n${command}\n\`\`\`\n\nAllow this command to run?`,
            choices: ["Allow", "Deny"],
          } as FeedbackPayload
        );
        if (typeof choice === "number" && choice !== 0) {
          result.content = "Command denied by user";
          result.isError = true;
          return result;
        }
      } catch {
        result.content = "Command execution interrupted: another approval is pending";
        result.isError = true;
        return result;
      }
    }

   let execResult: { stdout: string; stderr: string; status: number | null; signal?: string; killed?: boolean };
    try {
      execResult = await window.electronAPI.os.execCommand(command, folderPath);
    } catch (err) {
      return {
        callId: "",
        content: `Error executing command: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }

    const stdoutTruncated = truncateContent(execResult.stdout, MAX_LINES, MAX_BYTES);
    const stderrTruncated = truncateContent(execResult.stderr, MAX_LINES, MAX_BYTES);

    const output: ExecResult = {
      stdout: stdoutTruncated.content,
      stderr: stderrTruncated.content,
      status: execResult.status,
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
