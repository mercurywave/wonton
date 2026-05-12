import { filesystem } from "@neutralinojs/lib";

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

  const relativePath = await filesystem.getRelativePath(resolvedAbs, folderAbs);

  return {
    success: true,
    resolvedPath: normalizedResolved,
    relativePath,
  };
}
