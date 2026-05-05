export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface ChatMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  activeModel?: string;
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
