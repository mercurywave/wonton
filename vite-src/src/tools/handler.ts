import { Agent, ToolCall, ToolResult } from "../types/chat";
import { ChatSettings } from "../hooks/useChatSettings";
import { FeedbackPayload } from "../contexts";

export interface ToolContext {
  folderPath?: string;
  projectId?: string;
  chatId?: string;
  logId?: string;
  settings?: ChatSettings;
  onChatUpdated?: () => void;
  folderOverride?: string;
  showFeedback?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>;
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
  execute(args: object, context: ToolContext, toolCall: ToolCall): Promise<ToolResult>;
  getToolDefinitions?(folderPath?: string, agent?: Agent, allAgents?: Agent[]): Promise<ToolDefinition>;
  isAvailable?(folderPath?: string, agent?: Agent, allAgents?: Agent[]): boolean;
}
