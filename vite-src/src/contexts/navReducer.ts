import { ChatMeta, Page, ProjectMeta } from "../types/chat";
import { Project } from "../types/project";

// ── State ────────────────────────────────────────────────────────────────────

export type NavStatus = "initializing" | "loading" | "ready" | "error";

export interface NavState {
  projectId: string | null;
  chatId: string | null;
  chat: ChatMeta | null;
  page: Page;
  model: string | null;
  agentId: string | null;
  projectMeta: ProjectMeta | null;
  chats: ChatMeta[];
  projects: Project[];
  status: NavStatus;
  error: string | null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  // Projects loaded from disk; NavContext will restore last project
  { type: "PROJECTS_LOADED"; projects: Project[] }

  // User switched project
  | { type: "PROJECT_SWITCH"; projectId: string }

  // Project data (meta + chat list) loaded during switch
  | { type: "PROJECT_DATA_LOADED"; projectId: string; meta: ProjectMeta; chats: ChatMeta[] }

  // User selected a specific chat (from sidebar, history, etc.)
  | { type: "CHAT_SELECT"; chatId: string }

  // New chat was created on disk; append to list and select
  | { type: "CHAT_CREATED"; chat: ChatMeta }

  // Chat was deleted
  | { type: "CHAT_DELETED"; chatId: string }

  // Chat was renamed
  | { type: "CHAT_RENAMED"; chatId: string; name: string; updatedAt: number }

  // Chat model override changed
  | { type: "CHAT_MODEL_CHANGE"; chatId: string; model: string | undefined }

  // Chat agent override changed
  | { type: "CHAT_AGENT_CHANGE"; chatId: string; agentId: string | undefined }

  // Navigate to a page
  | { type: "PAGE_SET"; page: Page }

  // Project was deleted; switch to another project
  | { type: "PROJECT_DELETED"; fallbackProjectId: string }

  // Status transitions
  | { type: "LOADING" }
  | { type: "READY" }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }

  // Requested actions (handled by consuming component)
  | { type: "NEW_CHAT_REQUESTED" }
  | { type: "CHAT_DELETE_REQUESTED"; chatId: string }
  | { type: "CHAT_RENAME_REQUESTED"; chatId: string; name: string }

// ── Reducer ──────────────────────────────────────────────────────────────────

function findChatById(chats: ChatMeta[], id: string | null): ChatMeta | null {
  if (!id) return null;
  return chats.find((c) => c.id === id) ?? null;
}

export function navReducer(state: NavState, action: Action): NavState {
  switch (action.type) {
    case "PROJECTS_LOADED":
      return {
        ...state,
        projects: action.projects,
        status: "ready",
      };

    case "PROJECT_SWITCH": {
      const projectId = action.projectId;
      // Clear chat-related state when switching projects
      return {
        ...state,
        projectId,
        chatId: null,
        chat: null,
        model: null,
        agentId: null,
        page: "chat",
        status: "loading",
        error: null,
      };
    }

    case "PROJECT_DATA_LOADED": {
      const { projectId, meta, chats } = action;
      // If state's projectId doesn't match, ignore (stale result)
      if (state.projectId !== projectId) return state;

      // Determine which chat to select
      let selectedChat: ChatMeta | null = null;

      // Prefer the last active chat from project meta
      const lastActiveId = meta.activeChatId;
      if (lastActiveId && chats.some((c) => c.id === lastActiveId)) {
        selectedChat = chats.find((c) => c.id === lastActiveId) ?? null;
      } else if (chats.length > 0) {
        // Fall back to first chat
        selectedChat = chats[0];
      }

      const chatId = selectedChat?.id ?? null;

      return {
        ...state,
        projectMeta: meta,
        chats,
        chatId,
        chat: selectedChat,
        model: selectedChat?.activeModel ?? null,
        agentId: selectedChat?.activeAgentId ?? null,
        status: "ready",
      };
    }

    case "CHAT_SELECT": {
      const chat = findChatById(state.chats, action.chatId);
      if (!chat) return state;

      return {
        ...state,
        chatId: chat.id,
        chat,
        model: chat.activeModel ?? null,
        agentId: chat.activeAgentId ?? null,
        page: "chat",
      };
    }

    case "CHAT_CREATED": {
      const chat = action.chat;
      const chats = [chat, ...state.chats];

      return {
        ...state,
        chats,
        chatId: chat.id,
        chat,
        model: null,
        agentId: null,
        page: "chat",
      };
    }

    case "CHAT_DELETED": {
      const deletedId = action.chatId;
      const chats = state.chats.filter((c) => c.id !== deletedId);
      let chatId: string | null = null;
      let chat: ChatMeta | null = null;

      if (state.chatId === deletedId) {
        if (chats.length > 0) {
          chatId = chats[0].id;
          chat = chats[0];
        }
      }

      return {
        ...state,
        chats,
        chatId,
        chat,
        model: chat?.activeModel ?? null,
        agentId: chat?.activeAgentId ?? null,
      };
    }

    case "CHAT_RENAMED": {
      const chats = state.chats.map((c) =>
        c.id === action.chatId
          ? { ...c, name: action.name, updatedAt: action.updatedAt }
          : c
      );
      const chat = findChatById(chats, state.chatId);

      return {
        ...state,
        chats,
        chat,
      };
    }

    case "CHAT_MODEL_CHANGE": {
      const chats = state.chats.map((c) =>
        c.id === action.chatId
          ? { ...c, activeModel: action.model }
          : c
      );
      const chat = findChatById(chats, state.chatId);

      return {
        ...state,
        chats,
        chat,
        model: chat?.activeModel ?? null,
      };
    }

    case "CHAT_AGENT_CHANGE": {
      const chats = state.chats.map((c) =>
        c.id === action.chatId
          ? { ...c, activeAgentId: action.agentId }
          : c
      );
      const chat = findChatById(chats, state.chatId);

      return {
        ...state,
        chats,
        chat,
        agentId: chat?.activeAgentId ?? null,
      };
    }

    case "PAGE_SET":
      return {
        ...state,
        page: action.page,
      };

    case "PROJECT_DELETED": {
      const fallbackId = action.fallbackProjectId;
      return {
        ...state,
        projectId: fallbackId,
        chatId: null,
        chat: null,
        model: null,
        agentId: null,
        page: "chat",
        status: "loading",
        error: null,
      };
    }

    case "LOADING":
      return { ...state, status: "loading", error: null };

    case "READY":
      return { ...state, status: "ready" };

    case "SET_ERROR":
      return { ...state, status: "error", error: action.error };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "NEW_CHAT_REQUESTED":
      return {
        ...state,
        page: "chat",
        chatId: null,
        chat: null,
        model: null,
        agentId: null,
      };

    case "CHAT_DELETE_REQUESTED":
      return state;

    case "CHAT_RENAME_REQUESTED":
      return state;

    default:
      return state;
  }
}
