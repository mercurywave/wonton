import { filesystem } from "../utils/electronFs";
import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult } from "../types/chat";
import { sanitizeAndResolvePath, getEffectivePermission } from "./pathTools";
import { resolveTempFilePath } from "../utils/platformUtils";
import { chatStore } from "../store/chats";
import { projectMetaStore } from "../store/projectMeta";

export const EDIT_FILE_TOOL_NAME = "edit";

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

      // Validate that each oldText appears exactly once in the file
      for (let i = 0; i < edits.length; i++) {
        const oldText = edits[i].oldText;
        let startIndex = 0;
        let matchCount = 0;
        while (true) {
          const idx = content.indexOf(oldText, startIndex);
          if (idx === -1) break;
          matchCount++;
          startIndex = idx + 1;
        }
        if (matchCount === 0) {
          return {
            callId: "",
            content: `Error: edits[${i}].oldText not found in file: ${responsePath}`,
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
      for (let i = 0; i < edits.length; i++) {
        const existing = seenOldText.get(edits[i].oldText);
        if (existing !== undefined) {
          return {
            callId: "",
            content: `Error: edits[${existing}] and edits[${i}] have the same oldText. Each edit must target a unique region of the file.`,
            isError: true,
          };
        }
        seenOldText.set(edits[i].oldText, i);
      }

      // Check for overlapping edits using the single confirmed position of each oldText
      const positions = edits.map((edit, index) => ({
        ...edit,
        originalIndex: index,
        start: content.indexOf(edit.oldText),
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
      let newContent = content;
      for (let i = edits.length - 1; i >= 0; i--) {
        newContent = newContent.replace(edits[i].oldText, edits[i].newText);
      }

      // Write the modified content back
      await filesystem.writeFile(fullPath, newContent);

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
