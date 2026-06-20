import { Page } from "../types/chat";
import { Project } from "../types/project";

// ── State ────────────────────────────────────────────────────────────────────

export type NavStatus = "initializing" | "loading" | "ready" | "error";

export interface NavState {
  projectId: string | null;
  chatId: string | null;
  logId: string | null;
  page: Page;
  status: NavStatus;
  error: string | null;
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  // Projects loaded from disk; NavContext will restore last project
  { type: "PROJECTS_LOADED"; projects: Project[] }

  // User switched project
  | { type: "PROJECT_SWITCH"; projectId: string }

  // User selected a specific chat (from sidebar, history, etc.)
  | { type: "CHAT_SELECT"; chatId: string }

  // Navigate to a page
  | { type: "PAGE_SET"; page: Page }

  // User selected a specific log within a chat
  | { type: "LOG_SELECT"; logId: string }

  // User selected a chat with a specific log within it
  | { type: "CHAT_SELECT_WITH_LOG"; chatId: string; logId: string }

  // Project was deleted; switch to another project
  | { type: "PROJECT_DELETED"; fallbackProjectId: string }

  // Status transitions
  | { type: "LOADING" }
  | { type: "READY" }
  | { type: "LOADING_READY" }
  | { type: "SET_ERROR"; error: string }
  | { type: "CLEAR_ERROR" }

  // Requested actions (handled by consuming component)
  | { type: "NEW_CHAT_REQUESTED" }
  | { type: "CHAT_DELETE_REQUESTED"; chatId: string }
  | { type: "CHAT_RENAME_REQUESTED"; chatId: string; name: string }

// ── Reducer ──────────────────────────────────────────────────────────────────

export function navReducer(state: NavState, action: Action): NavState {
  switch (action.type) {
    case "PROJECTS_LOADED":
      return {
        ...state,
        status: "ready",
      };

    case "PROJECT_SWITCH": {
      const projectId = action.projectId;
      return {
        ...state,
        projectId,
        chatId: null,
        logId: null,
        page: "chat" as Page,
        status: "loading",
        error: null,
      };
    }

    case "CHAT_SELECT":
      return {
        ...state,
        chatId: action.chatId,
        logId: null,
        page: "chat" as Page,
      };

    case "LOG_SELECT":
      return {
        ...state,
        logId: action.logId,
      };

    case "CHAT_SELECT_WITH_LOG":
      return {
        ...state,
        chatId: action.chatId,
        logId: action.logId,
        page: "chat" as Page,
      };

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
        logId: null,
        page: "chat" as Page,
        status: "loading",
        error: null,
      };
    }

    case "LOADING":
      return { ...state, status: "loading", error: null };

    case "READY":
      return { ...state, status: "ready" };

    case "LOADING_READY":
      return { ...state, status: "ready" };

    case "SET_ERROR":
      return { ...state, status: "error", error: action.error };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "NEW_CHAT_REQUESTED":
      return {
        ...state,
        page: "chat" as Page,
        chatId: null,
        logId: null,
      };

    case "CHAT_DELETE_REQUESTED":
      return {
        ...state,
        chatId: null,
        logId: null,
      };

    case "CHAT_RENAME_REQUESTED":
      return state;

    default:
      return state;
  }
}
