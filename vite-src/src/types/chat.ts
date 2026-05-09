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

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  stats?: LLMStats;
}

export interface ChatMeta {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeModel?: string;
  logId?: string;
  draft?: string;
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
