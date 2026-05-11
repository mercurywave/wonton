import { ToolResult } from "../types/chat";

export interface ToolContext {
  folderPath?: string;
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
