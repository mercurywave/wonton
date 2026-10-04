import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { FeedbackPayload, emit } from "../contexts";
import { reserveTempFile, writeTempFile } from "../utils/tempFiles";

export const GIT_COMMAND_TOOL_NAME = "git";

// Threshold: if output exceeds this, write to temp file instead of inline
const LARGE_OUTPUT_THRESHOLD = 4096; // 4KB

// Known git subcommands that are considered "simple" and safe to auto-execute
const SIMPLE_GIT_SUBCOMMANDS = new Set([
  "status",
  "log",
  "diff",
  "show",
  "branch",
  "checkout",
  "commit",
  "push",
  "pull",
  "fetch",
  "merge",
  "rebase",
  "stash",
  "clone",
  "add",
  "rm",
  "mv",
  "config",
  "tag",
  "remote",
  "init",
  "reset",
  "restore",
  "worktree",
  "switch",
  "clean",
  "grep",
  "blame",
  "annotate",
  "ls-files",
  "ls-tree",
  "cat-file",
  "rev-parse",
  "for-each-ref",
  "describe",
  "var",
  "version",
  "help",
  "archive",
  "bisect",
  "diagnose",
  "gc",
  "prune",
  "reflog",
  "rerere",
  "sec-filter",
]);

interface GitResult {
  stdout: string;
  stderr: string;
  status: number | null;
  tempFileIds?: string[];
  hasLargeOutput: boolean;
}

/**
 * Classify a git command into one of three categories:
 * - "simple": auto-execute if in the known simple subcommands list
 * - "complex": prompt user for any unrecognized git command
 * - "invalid": reject immediately (not a git command at all)
 */
function classifyGitCommand(input: string): "simple" | "complex" | "invalid" {
  const trimmed = input.trim();

  // Must start with "git"
  const parts = trimmed.split(/\s+/);
  if (parts[0] !== "git") {
    return "invalid";
  }

  if (parts.length < 2) {
    return "invalid";
  }

  const subcommand = parts[1];

  // Reject shell metacharacters that indicate pipelines or dangerous constructs
  // (pipes, semicolons, and logical operators — but allow quotes, angle brackets for redirects)
  if (/[|;&]/.test(trimmed)) {
    return "complex";
  }

  // Check if the subcommand is in the simple list
  if (SIMPLE_GIT_SUBCOMMANDS.has(subcommand)) {
    return "simple";
  }

  // Anything else is treated as complex (requires user approval)
  return "complex";
}

export class GitCommandHandler implements ToolHandler {
  private static instance: GitCommandHandler;

  readonly name = GIT_COMMAND_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: GIT_COMMAND_TOOL_NAME,
      description:
        "Executes a git command within the project's folder. Only git CLI commands are supported.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The git command to execute (e.g., 'git status', 'git pull', 'git log --oneline -10')",
          },
        },
        required: ["command"],
      },
    },
  };

  isAvailable?(folderPath?: string): boolean {
    return !!folderPath;
  }

  private constructor() {}

  static getInstance(): GitCommandHandler {
    if (!GitCommandHandler.instance) {
      GitCommandHandler.instance = new GitCommandHandler();
    }
    return GitCommandHandler.instance;
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

    if (!command || command.trim().length < 1) {
      return {
        callId: "",
        content: "Error: Git command is required",
        isError: true,
      };
    }

    // Validate that this is a git command
    const classification = classifyGitCommand(command);

    if (classification === "invalid") {
      return {
        callId: "",
        content: "Error: This tool only supports git CLI commands. Please use a git command such as 'git status', 'git pull', 'git commit', etc.",
        isError: true,
      };
    }

    // For "complex" commands, prompt the user for approval (like exec does)
    if (classification === "complex" && showFeedback && projectId && chatId && logId) {
      emit("commandWaitingApproval", { command });
      const result: ToolResult = { callId: "", content: "", isError: false };

      try {
        const choice = await showFeedback(
          projectId,
          chatId,
          logId,
          {
            type: "select",
            question: `The agent wants to run a complex git command:\n\`\`\`\n${command}\n\`\`\`\n\nAllow this command to run?`,
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

    // Execute the git command
    let execResult: { stdout: string; stderr: string; status: number | null; signal?: string; killed?: boolean };
    try {
      execResult = await window.electronAPI.os.execCommand(command, folderPath);
    } catch (err) {
      return {
        callId: "",
        content: `Error executing git command: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }

    const stdout = execResult.stdout;
    const stderr = execResult.stderr;

    // Write large output to temp files, small output inline
    let stdoutRef: string | null = null;
    let stderrRef: string | null = null;

    if (stdout.length > LARGE_OUTPUT_THRESHOLD && projectId && chatId) {
      const stdoutTempFile = await reserveTempFile(projectId, chatId, "git-stdout.txt");
      tempFileIds.push(stdoutTempFile);
      await writeTempFile(projectId, stdoutTempFile, stdout);
      stdoutRef = stdoutTempFile;
    }

    if (stderr.length > LARGE_OUTPUT_THRESHOLD && projectId && chatId) {
      const stderrTempFile = await reserveTempFile(projectId, chatId, "git-stderr.txt");
      tempFileIds.push(stderrTempFile);
      await writeTempFile(projectId, stderrTempFile, stderr);
      stderrRef = stderrTempFile;
    }

    const output: GitResult = {
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
