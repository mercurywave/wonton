import { filesystem } from "../utils/electronFs";
import { FilePermission } from "../types/chat";
import { ToolResult } from "../types/chat";
import { FeedbackPayload } from "../contexts";

export interface SanitizePathResult {
  success: boolean;
  resolvedPath?: string;
  relativePath?: string;
  error?: string;
}

interface CheckWarnResultDenied {
  denied: true;
  result: ToolResult;
}

interface CheckWarnResultAllowed {
  denied: false;
}

type CheckWarnResult = CheckWarnResultDenied | CheckWarnResultAllowed;

export async function checkFilePermissionWarn(
  showFeedback: ((projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>) | undefined,
  projectId: string,
  chatId: string,
  logId: string,
  operation: "write" | "edit",
  relativePath: string,
): Promise<CheckWarnResult> {
  return checkPermissionWarn(showFeedback, projectId, chatId, logId, operation, relativePath);
}

export async function checkDirectoryPermissionWarn(
  showFeedback: ((projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>) | undefined,
  projectId: string,
  chatId: string,
  logId: string,
  relativePath: string,
): Promise<CheckWarnResult> {
  return checkPermissionWarn(showFeedback, projectId, chatId, logId, "create directory", relativePath);
}

async function checkPermissionWarn(
  showFeedback: ((projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>) | undefined,
  projectId: string,
  chatId: string,
  logId: string,
  operation: string,
  relativePath: string,
): Promise<CheckWarnResult> {
  if (!showFeedback) {
    return { denied: false };
  }

  const choice = await showFeedback(
    projectId, chatId, logId,
    {
      type: "select",
      question: `The agent wants to ${operation}:\n\`\`\`\n${relativePath}\n\`\`\`\n\nAllow the operation?`,
      choices: ["Allow", "Deny", "Deny with Instructions"],
    } as FeedbackPayload
  );

  if (typeof choice === "number") {
    if (choice === 0) {
      return { denied: false };
    }
    if (choice === 1) {
      return {
        denied: true,
        result: {
          callId: "",
          content: "Operation denied by user",
          isError: true,
        },
      };
    }
    if (choice === 2) {
      const instructions = await showFeedback(
        projectId, chatId, logId,
        {
          type: "text",
          question: "Provide instructions for the agent:",
          placeholder: "Provide instructions for the agent",
        } as FeedbackPayload
      );
      if (typeof instructions === "string" && instructions.trim()) {
        return {
          denied: true,
          result: {
            callId: "",
            content: `Operation denied by user: ${instructions}`,
            isError: true,
          },
        };
      }
      return {
        denied: true,
        result: {
          callId: "",
          content: "Operation denied by user",
          isError: true,
        },
      };
    }
  }

  return { denied: false };
}

export function normalizePathSeparators(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export async function sanitizeAndResolvePath(
  folderPath: string,
  filePath: string
): Promise<SanitizePathResult> {
  if (!folderPath || !filePath) {
    return {
      success: false,
      error: "Path and folder are required",
    };
  }

  const trimmed = filePath.trim();
  if (!trimmed || trimmed.length === 0) {
    return {
      success: false,
      error: "File path is empty after sanitization",
    };
  }

  const joined = await filesystem.getJoinedPath(folderPath, trimmed);
  const normalizedJoined = normalizePathSeparators(joined);

  const folderAbs = await filesystem.getAbsolutePath(folderPath);
  const folderAbsNorm = normalizePathSeparators(folderAbs);

  const resolvedAbs = await filesystem.getAbsolutePath(normalizedJoined);
  const resolvedAbsNorm = normalizePathSeparators(resolvedAbs);

  const normalizedResolved = resolvedAbsNorm.replace(/\\/g, "/");
  const normalizedBase = folderAbsNorm.replace(/\\/g, "/");

  if (
    normalizedResolved !== normalizedBase &&
    !normalizedResolved.startsWith(normalizedBase + "/")
  ) {
    return {
      success: false,
      error: "Resolved path is outside project folder",
    };
  }

  const relativePath = await filesystem.getRelativePath(folderAbs, resolvedAbs);

  return {
    success: true,
    resolvedPath: normalizedResolved,
    relativePath,
  };
}

export function getEffectivePermission(
  permissions: Record<string, FilePermission> | undefined,
  relativePath: string,
  isDirectory: boolean
): FilePermission {
  if (!permissions || Object.keys(permissions).length === 0) {
    return "full";
  }

  const parts = relativePath.split("/").filter(Boolean);

  for (let i = 0; i < parts.length; i++) {
    const ancestorPath = parts.slice(0, i + 1).join("/");
    const perm = permissions[ancestorPath];
    if (perm === "hidden") {
      return "hidden";
    }
    if (perm === "readonly" && isDirectory) {
      return "readonly";
    }
    if (perm === "warn" && !isDirectory) {
      return "warn";
    }
  }

  return "full";
}
