import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { sanitizeAndResolvePath, getEffectivePermission, checkFilePermissionWarn } from "./pathTools";
import { resolveTempFilePath } from "../utils/platformUtils";
import { chatStore } from "../store/chats";
import { projectMetaStore } from "../store/projectMeta";

export const EDIT_FILE_TOOL_NAME = "edit";

function detectLineEnding(content: string): "\r\n" | "\n" | "\r" | "" {
  const lineEndings = content.match(/\r\n|\n|\r/g) as Array<"\r\n" | "\n" | "\r"> | null;
  if (!lineEndings) return "";

  const counts = new Map<"\r\n" | "\n" | "\r", number>();
  for (const lineEnding of lineEndings as Array<"\r\n" | "\n" | "\r">) {
    counts.set(lineEnding, (counts.get(lineEnding) ?? 0) + 1);
  }

  let predominant = lineEndings[0];
  for (const lineEnding of lineEndings) {
    if ((counts.get(lineEnding) ?? 0) > (counts.get(predominant) ?? 0)) {
      predominant = lineEnding;
    }
  }
  return predominant;
}

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n|\r|\n/g, "\n");
}

function applyLineEnding(content: string, newline: "\r\n" | "\n" | "\r" | ""): string {
  return newline ? content.replace(/\n/g, newline) : content;
}

function formatCharacterForError(character: string | undefined): string {
  return character === undefined ? "end of text" : JSON.stringify(character);
}

function formatContextForError(content: string, position: number, radius = 20): string {
  return JSON.stringify(content.slice(Math.max(0, position - radius), position + radius + 1));
}

function describeClosestMismatch(expected: string, content: string): string {
  const lines = expected.split("\n");
  let anchor = "";
  let anchorOffset = 0;
  let offset = 0;

  for (const line of lines) {
    if (line.trim().length > anchor.trim().length) {
      anchor = line;
      anchorOffset = offset;
    }
    offset += line.length + 1;
  }

  if (!anchor) {
    return "No non-blank line was available to locate a close match.";
  }

  let closestStart = -1;
  let longestPrefix = -1;
  let anchorIndex = content.indexOf(anchor);
  while (anchorIndex !== -1) {
    const candidateStart = anchorIndex - anchorOffset;
    if (candidateStart >= 0) {
      let prefixLength = 0;
      while (
        prefixLength < expected.length &&
        candidateStart + prefixLength < content.length &&
        expected[prefixLength] === content[candidateStart + prefixLength]
      ) {
        prefixLength++;
      }
      if (prefixLength > longestPrefix) {
        closestStart = candidateStart;
        longestPrefix = prefixLength;
      }
    }
    anchorIndex = content.indexOf(anchor, anchorIndex + 1);
  }

  if (closestStart === -1) {
    return "No matching non-blank line was found; the file may have changed since it was read.";
  }

  const mismatchPosition = longestPrefix;
  const actualPosition = closestStart + mismatchPosition;
  return `Closest match differs at character ${mismatchPosition + 1}: expected ${formatCharacterForError(expected[mismatchPosition])}, found ${formatCharacterForError(content[actualPosition])}. Expected context: ${formatContextForError(expected, mismatchPosition)}. File context: ${formatContextForError(content, actualPosition)}.`;
}

export class EditFileHandler implements ToolHandler {
  private static instance: EditFileHandler;

  readonly name = EDIT_FILE_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: EDIT_FILE_TOOL_NAME,
      description:
        "Edit a single file using exact text replacement. Every edits[].oldText must match a unique, non-overlapping region of the original file. If two changes affect the same block or nearby lines, merge them into one edit instead of emitting overlapping edits. Do not include large unchanged regions just to connect distant changes.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the file to edit",
          },
          edits: {
            type: "array",
            description: "Array of edit operations to perform. Each must have oldText that matches the original file exactly, and newText to replace it with.",
            items: {
              type: "object",
              properties: {
                oldText: {
                  type: "string",
                  description: "The exact text to find and replace in the file",
                },
                newText: {
                  type: "string",
                  description: "The text to replace oldText with",
                },
              },
              required: ["oldText", "newText"],
            },
          },
        },
        required: ["path", "edits"],
      },
    },
  };
  
  isAvailable?(folderPath?: string): boolean{
    return !!folderPath;
  }

  private constructor() {}

  static getInstance(): EditFileHandler {
    if (!EditFileHandler.instance) {
      EditFileHandler.instance = new EditFileHandler();
    }
    return EditFileHandler.instance;
  }

  async execute(args: object, context: ToolContext): Promise<ToolResult> {
    const { path, edits } = args as { path: string; edits: { oldText: string; newText: string }[] };
    const { folderPath, projectId, chatId, logId, showFeedback } = context;

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

    if (!edits || edits.length < 1) {
      return {
        callId: "",
        content: "Error: At least one edit is required",
        isError: true,
      };
    }

    for (let i = 0; i < edits.length; i++) {
      if (!edits[i].oldText || edits[i].oldText.length < 1) {
        return {
          callId: "",
          content: `Error: edits[${i}].oldText is required and cannot be empty`,
          isError: true,
        };
      }
    }

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
          content: `Error: File is hidden and cannot be edited: ${responsePath}`,
          isError: true,
        };
      }
      if (effectivePerm === "readonly") {
        return {
          callId: "",
          content: `Error: File is read-only and cannot be edited: ${responsePath}`,
          isError: true,
        };
      }
      if (effectivePerm === "warn") {
        const warnResult = await checkFilePermissionWarn(
          showFeedback, projectId!, chatId!, logId!,
          "edit", responsePath
        );
        if (warnResult.denied) {
          return warnResult.result;
        }
      }
    }

    try {
      // Read the file content
      const content = await filesystem.readFile(fullPath);
      if (!content) {
        return {
          callId: "",
          content: `Error: Could not read file: ${responsePath}`,
          isError: true,
        };
      }

      const fileLineEnding = detectLineEnding(content);
      const normalizedContent = normalizeLineEndings(content);
      const normalizedEdits = edits.map((edit) => ({
        oldText: normalizeLineEndings(edit.oldText),
        newText: normalizeLineEndings(edit.newText),
      }));

      // Validate that each oldText appears exactly once in the file
      for (let i = 0; i < normalizedEdits.length; i++) {
        const oldText = normalizedEdits[i].oldText;
        let startIndex = 0;
        let matchCount = 0;
        while (true) {
          const idx = normalizedContent.indexOf(oldText, startIndex);
          if (idx === -1) break;
          matchCount++;
          startIndex = idx + 1;
        }
        if (matchCount === 0) {
          return {
            callId: "",
            content: `Error: edits[${i}].oldText not found in file: ${responsePath}. ${describeClosestMismatch(oldText, normalizedContent)}`,
            isError: true,
          };
        }
        if (matchCount > 1) {
          return {
            callId: "",
            content: `Error: edits[${i}].oldText appears ${matchCount} times in file: ${responsePath}. It must match a unique occurrence. Add more context to make it unique.`,
            isError: true,
          };
        }
      }

      // Check for duplicate oldText values across edits
      const seenOldText = new Map<string, number>();
      for (let i = 0; i < normalizedEdits.length; i++) {
        const existing = seenOldText.get(normalizedEdits[i].oldText);
        if (existing !== undefined) {
          return {
            callId: "",
            content: `Error: edits[${existing}] and edits[${i}] have the same oldText. Each edit must target a unique region of the file.`,
            isError: true,
          };
        }
        seenOldText.set(normalizedEdits[i].oldText, i);
      }

      // Check for overlapping edits using the single confirmed position of each oldText
      const positions = normalizedEdits.map((edit, index) => ({
        ...edit,
        originalIndex: index,
        start: normalizedContent.indexOf(edit.oldText),
      }));

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const aStart = positions[i].start;
          const aEnd = aStart + positions[i].oldText.length;
          const bStart = positions[j].start;
          const bEnd = bStart + positions[j].oldText.length;

          if (aStart < bEnd && bStart < aEnd) {
            return {
              callId: "",
              content: `Error: edits[${positions[i].originalIndex}] and edits[${positions[j].originalIndex}] overlap in file: ${responsePath}. Merge them into a single edit or use non-overlapping text.`,
              isError: true,
            };
          }
        }
      }

      // Apply edits in reverse order to preserve positions
      let newContent = normalizedContent;
      for (let i = normalizedEdits.length - 1; i >= 0; i--) {
        newContent = newContent.replace(normalizedEdits[i].oldText, normalizedEdits[i].newText);
      }

      // Preserve the file's existing line-ending convention when writing back.
      const finalContent = applyLineEnding(newContent, fileLineEnding);

      // Write the modified content back
      await filesystem.writeFile(fullPath, finalContent);

      const stat = await filesystem.getStats(fullPath);

      const result = JSON.stringify({
        path: responsePath,
        operation: "edit",
        success: true,
        size: stat?.size || 0,
        editsApplied: edits.length,
      });

      return {
        callId: "",
        content: result,
      };
    } catch (err) {
      return {
        callId: "",
        content: `Error editing file: ${err instanceof Error ? err.message : String(err)}`,
        isError: true,
      };
    }
  }
}
