import { filesystem } from "../utils/electronFs";
import { FilePermission } from "../types/chat";

export interface SanitizePathResult {
  success: boolean;
  resolvedPath?: string;
  relativePath?: string;
  error?: string;
}

function normalizePathSeparators(filePath: string): string {
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
  }

  return "full";
}
