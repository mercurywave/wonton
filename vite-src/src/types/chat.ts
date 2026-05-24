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
  workflowId?: string;
  workflowStateKey?: string;
  workflowData?: Record<string, unknown>;
  logId: string;
  draft?: string;
  subagents?: SubagentMeta[];
}

export interface ProjectMeta {
  createdAt: number;
  systemPrompt?: string;
  defaultModel?: string;
  disabledFlows?: string[];
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  initialState: string;
  schemaVersion: number;
  states: Record<string, FlowState>;
}

export interface FlowActionButton {
  label: string;
  idx: number;
}

export interface FlowState {
  message: string;
  onEnter?: string;
  hookAdjustPrompt?: string;
  onSendPrompt?: string;
  onChatResponse?: string;
  onActionButton?: string;
  actionButtons?: FlowActionButton[];
}

export interface WorkflowStateContext {
  chatId: string;
  workflowId: string;
  stateKey: string;
  workflowData: Record<string, unknown>;
  modelId?: string;
}

export interface Won {
  advance(nextStateKey: string): Promise<void>;
  getState(): WorkflowStateContext;
  setWorkflowData(partial: Partial<Record<string, unknown>>): Promise<void>;
}

export type Page = "chat" | "chatList" | "projects" | "projectSettings" | "settings" | "history" | "workflows";

export interface ServerModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}
