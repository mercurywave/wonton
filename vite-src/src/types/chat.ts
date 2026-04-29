export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export type Page = "chat" | "settings";

export interface ServerModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}
