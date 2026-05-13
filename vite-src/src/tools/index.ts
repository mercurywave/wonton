import { ToolDefinition, ToolResult } from "../types/chat";
import { ToolContext, ToolHandler } from "./handler";
export type { ToolContext, ToolHandler } from "./handler";
import { SearchFilesHandler } from "./searchFiles";
import { SearchContentsHandler } from "./searchContents";
import { ReadFileHandler } from "./readFile";
import { WriteFileHandler } from "./writeFile";
import { EditFileHandler } from "./editFile";

const toolHandlers: Record<string, ToolHandler> = {};

export function registerTool(handler: ToolHandler): void {
  toolHandlers[handler.name] = handler;
}

registerTool(SearchFilesHandler.getInstance());
registerTool(SearchContentsHandler.getInstance());
registerTool(ReadFileHandler.getInstance());
registerTool(WriteFileHandler.getInstance());
registerTool(EditFileHandler.getInstance());

export function getToolHandler(toolName: string): ToolHandler | undefined {
  return toolHandlers[toolName];
}

export async function executeToolCall(
  toolName: string,
  args: object,
  context: ToolContext
): Promise<ToolResult> {
  const handler = getToolHandler(toolName);
  if (!handler) {
    return {
      callId: "",
      content: `Error: Unknown tool "${toolName}"`,
      isError: true,
    };
  }
  return handler.execute(toolName, args, context);
}

export function getAvailableTools(folderPath?: string): ToolDefinition[] {
  if (!folderPath) {
    return [];
  }
  return Object.values(toolHandlers).map((h) => h.definition);
}
