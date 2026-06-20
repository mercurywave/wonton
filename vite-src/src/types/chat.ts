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
  logId?: string;
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
  reasoningContent?: string;
  timestamp: number;
  stats?: LLMStats;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  originalContent?: string;
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
  folderOverride?: string;
  subagentAllowlist?: string[];
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

export interface VersionHistoryEntry {
  logId: string;
  createdAt: number;
  updatedAt: number;
}

export interface TempFileReservation {
  baseName: string;
  uniqueName: string;
}

export interface ChatMeta {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeModel?: string;
  activeAgentId?: string;
  reasoningEffort?: ReasoningEffort;
  workflowId?: string;
  workflowStateKey?: string;
  workflowData?: Record<string, unknown>;
  logId: string;
  queriesLogId?: string;
  draft?: string;
  subagents?: SubagentMeta[];
  reservedTempFiles?: TempFileReservation[];
  versionCreatedAt?: number;
  versionHistory?: VersionHistoryEntry[];
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
  initialState?: string;
  schemaVersion?: number;
  states?: Record<string, FlowState>;
  command?: string;
  isCommand?: boolean;
  source?: string; // "global" or project ID
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
  modelId?: string;
}

export interface ChatHistoryEntry {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

export interface WonQueryOptions {
  systemPrompt?: string;
  model?: string;
}

export interface SubagentOptions {
  agent?: string;
  model?: string;
  thinking?: boolean | "low" | "medium" | "high";
}

export interface Won {
  advance(nextStateKey: string): Promise<void>;
  setWorkflowData(partial: Partial<Record<string, unknown>>): Promise<void>;
  get(key: string): unknown;
  set(key: string, value: unknown): Promise<void>;
  reserveTempFile(baseName?: string): Promise<string>;
  openFile(uniqueName: string): void;
  getChatHistory(): ChatHistoryEntry[];
  getChatName(): string;
  pushMessage(entry: ChatHistoryEntry): Promise<void>;
  createNewVersion(): Promise<void>;
  createChatWithHistory(
    history: ChatHistoryEntry[],
    options?: {
      name?: string;
      workflowId?: string;
      initialPrompt?: string;
    }
  ): Promise<ChatMeta>;
  runQuery(messages: string | ChatHistoryEntry[], options?: WonQueryOptions): Promise<string>;
  runCommand(command: string): Promise<{ stdout: string; stderr: string; code: number | null }>;
  getChatDraft(): string;
  setChatDraft(draft: string): Promise<void>;
  alert(message: string): Promise<void>;
  select(question: string, choices: string[]): Promise<number>;
  prompt(question: string, options?: { placeholder?: string }): Promise<string | undefined>;
  setStatus(message?: string): void;
  createSubagent(options?: SubagentOptions): Promise<string>;
  runAgent(logId: string, userMessage: string): Promise<string>;
}

export interface StatsEntry {
  id: string;
  timestamp: number;
  projectId: string;
  chatId: string;
  logId: string;
  model: string;
  agentId: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timeMs: number;
  // llama.cpp timings (optional)
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

export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  projectId: string;
  text: string;
  createdAt: number;
  graduatedAt?: number;
  chatId?: string;
  priority?: TaskPriority;
}

export type Page = "chat" | "chatList" | "projects" | "projectSettings" | "settings" | "history" | "workflows" | "stats" | "tasks" | "references" | "agents";

export interface ServerModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

export type ReasoningEffort = "none" | "low" | "medium" | "high";
