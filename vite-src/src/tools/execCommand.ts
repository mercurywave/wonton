import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { FeedbackPayload, emit } from "../contexts";
import { reserveTempFile, writeTempFile } from "../utils/tempFiles";
import { getPlatform } from "../utils/platformUtils";

export const EXEC_COMMAND_TOOL_NAME = "exec";

// Threshold: if output exceeds this, write to temp file instead of inline
const LARGE_OUTPUT_THRESHOLD = 4096; // 4KB

interface ExecResult {
  stdout: string;
  stderr: string;
  status: number | null;
  tempFileIds?: string[];
  hasLargeOutput: boolean;
}

export class ExecCommandHandler implements ToolHandler {
  private static instance: ExecCommandHandler;

  readonly name = EXEC_COMMAND_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: EXEC_COMMAND_TOOL_NAME,
      description:
        "Executes a shell command on the system within the project's folder. Returns stdout, stderr, exit status, and temp file paths if output is large. Large output is written to temp files that the agent can read.",
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

  async getToolDefinitions?(): Promise<ToolDefinition>{
    const platform = await getPlatform();
    const platformName = platform === "win32" ? "Windows" : platform === "darwin" ? "macOS" : platform === "linux" ? "Linux" : platform;
    const definition = JSON.parse(JSON.stringify(this.definition)) as ToolDefinition;
    (definition.function as Record<string, unknown>).description = `Executes a shell command on the system within the project's folder (Running on ${platformName}). Returns stdout, stderr, exit status, and temp file paths if output is large. Large output is written to temp files that the agent can read.`;
    return definition;
  }

  static getInstance(): ExecCommandHandler {
    if (!ExecCommandHandler.instance) {
      ExecCommandHandler.instance = new ExecCommandHandler();
    }
    return ExecCommandHandler.instance;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { command } = args as { command: string };
    const { folderPath, showFeedback, projectId, chatId, logId } = context;
    const tempFileIds: string[] = [];

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
      emit("commandWaitingApproval", { command });
      const result: ToolResult = { callId: "", content: "", isError: false };
      try {
        const choice = await showFeedback(
          projectId,
          chatId,
          logId,
          {
            type: "select",
            question: `The agent wants to run:\n\`\`\`\n${command}\n\`\`\`\n\nAllow this command to run?`,
            choices: ["Allow", "Deny", "Reject with Instructions"],
          } as FeedbackPayload
        );
        if (typeof choice === "number") {
          if (choice === 0) {
            // Allow - proceed with command
          } else if (choice === 1) {
            // Deny without instructions
            result.content = "Command denied by user";
            result.isError = true;
            return result;
          } else if (choice === 2) {
            // Reject with instructions
            const instructions = await showFeedback(
              projectId,
              chatId,
              logId,
              {
                type: "text",
                question: "Please provide instructions for rejecting this command:",
                placeholder: "e.g., Use a different approach, modify the command, etc.",
              } as FeedbackPayload
            );
            if (typeof instructions === "string" && instructions.trim()) {
              result.content = `Command denied by user: ${instructions}`;
            } else {
              result.content = "Command denied by user";
            }
            result.isError = true;
            return result;
          }
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

    const stdout = execResult.stdout;
    const stderr = execResult.stderr;

    // Write large output to temp files, small output inline
    let stdoutRef: string | null = null;
    let stderrRef: string | null = null;

    if (stdout.length > LARGE_OUTPUT_THRESHOLD && projectId && chatId) {
      const stdoutTempFile = await reserveTempFile(projectId, chatId, "stdout.txt");
      tempFileIds.push(stdoutTempFile);
      await writeTempFile(projectId, stdoutTempFile, stdout);
      stdoutRef = stdoutTempFile;
    }

    if (stderr.length > LARGE_OUTPUT_THRESHOLD && projectId && chatId) {
      const stderrTempFile = await reserveTempFile(projectId, chatId, "stderr.txt");
      tempFileIds.push(stderrTempFile);
      await writeTempFile(projectId, stderrTempFile, stderr);
      stderrRef = stderrTempFile;
    }

    const output: ExecResult = {
      stdout: stdoutRef ?? stdout,
      stderr: stderrRef ?? stderr,
      status: execResult.status,
      tempFileIds: tempFileIds.length > 0 ? tempFileIds : undefined,
      hasLargeOutput: !!(stdoutRef || stderrRef),
    };

    return {
      callId: "",
      content: JSON.stringify(output),
    };
  }
}
