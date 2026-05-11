import { ToolResult } from "../types/chat";

export interface ToolContext {
  folderPath?: string;
}

export interface ToolHandler {
  execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult>;
}
