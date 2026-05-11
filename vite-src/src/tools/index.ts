import { ToolResult, ToolDefinition } from "../types/chat";
import { ToolContext, ToolHandler } from "./handler";
export type { ToolContext, ToolHandler } from "./handler";
import { SearchFilesHandler, SEARCH_FILES_TOOL } from "./searchFiles";

const toolHandlers: Record<string, ToolHandler> = {};
const toolDefinitions: Array<() => ToolDefinition> = [];

export function registerTool(name: string, handler: ToolHandler, definitionFn: () => ToolDefinition): void {
  toolHandlers[name] = handler;
  toolDefinitions.push(definitionFn);
}

SearchFilesHandler.getInstance();
registerTool("searchFiles", SearchFilesHandler.getInstance(), () => SEARCH_FILES_TOOL);

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
  return toolDefinitions.map((fn) => fn());
}
