import { ToolResult } from "../types/chat";
import { ChatSettings } from "../hooks/useChatSettings";

export interface ToolContext {
  folderPath?: string;
  projectId?: string;
  chatId?: string;
  settings?: ChatSettings;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export interface ToolHandler {
  readonly name: string;
  readonly definition: ToolDefinition;
  execute(toolName: string, args: object, context: ToolContext): Promise<ToolResult>;
}
