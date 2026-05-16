export interface LLMStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string;
  timeMs: number;
  // llamacpp timings
  cacheN?: number;
  promptN?: number;
  promptMs?: number;
  promptPerTokenMs?: number;
  promptPerSecond?: number;
  predictedN?: number;
  predictedMs?: number;
  predictedPerTokenMs?: number;
  predictedPerSecond?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolResult {
  callId: string;
  content: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  stats?: LLMStats;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: object;
  };
}

export interface Agent {
  id: string;
  name: string;
  systemPrompt: string;
  main: boolean;
  defaultToolSet?: string[];
}

export interface SubagentMeta {
  id: string;
  agentId: string;
  toolSet: string[];
  query: string;
  status: "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  logId: string;
}

export interface ChatMeta {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeModel?: string;
  activeAgentId?: string;
  logId: string;
  draft?: string;
  subagents?: SubagentMeta[];
}

export interface ProjectMeta {
  activeChatId?: string;
  systemPrompt?: string;
  defaultModel?: string;
}

export type Page = "chat" | "chatList" | "projects" | "projectSettings" | "settings" | "history";

export interface ServerModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}
