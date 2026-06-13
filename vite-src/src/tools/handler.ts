import { ToolCall, ToolResult } from "../types/chat";
import { ChatSettings } from "../hooks/useChatSettings";
import { FeedbackPayload } from "../contexts";

export interface ToolContext {
  folderPath?: string;
  projectId?: string;
  chatId?: string;
  settings?: ChatSettings;
  onChatUpdated?: () => void;
  folderOverride?: string;
  onValidate?: (payload: FeedbackPayload) => Promise<number | void>;
  navigateToChatWithLog?: (chatId: string, logId: string) => void;
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
}
