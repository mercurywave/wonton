import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
  useMemo,
} from "react";
import { Page } from "../types/chat";
import { navReducer, NavState, Action } from "./navReducer";
import { useSettings } from "./SettingsContext";
import { useProjects } from "./ProjectsContext";

export interface NavContextValue {
  state: NavState;
  activeProjectId: string | null;
  logId: string | null;
  navigateToProject: (projectId: string) => void;
  navigateToChat: (chatId: string) => void;
  navigateToLog: (logId: string) => void;
  navigateToNewChat: () => Promise<void>;
  navigateToDeleteChat: (chatId: string) => Promise<void>;
  navigateToRenameChat: (chatId: string, name: string) => Promise<void>;
  navigateToPage: (page: Page) => void;
  dispatch: React.Dispatch<Action>;
}

const NavContext = createContext<NavContextValue | null>(null);

export function NavProvider({ children }: { children: ReactNode }) {
  const { projects, initialized } = useProjects();
  const { settings, updateSettings } = useSettings();

  const initialState: NavState = {
    projectId: null,
    chatId: null,
    logId: null,
    page: "chat" as Page,
    status: "initializing",
    error: null,
  };

  const [state, dispatch] = useReducer(navReducer, initialState);
  const initializedRef = useRef(false);

  // ── Side effect: when projects are loaded, restore last project ──────────
  useEffect(() => {
    if (!initialized) return;
    if (initializedRef.current) return;
    initializedRef.current = true;

    dispatch({ type: "PROJECTS_LOADED", projects });

    // Restore last project from settings
    const lastId = settings.lastProjectId;
    const hasDefault = projects.some((p) => p.id === "default");

    if (lastId && lastId !== "default" && projects.some((p) => p.id === lastId)) {
      dispatch({ type: "PROJECT_SWITCH", projectId: lastId });
    } else if (hasDefault) {
      dispatch({ type: "PROJECT_SWITCH", projectId: "default" });
    }
  }, [projects, initialized, settings.lastProjectId]);

  // ── Persist lastProjectId whenever it changes ───────────────────────────
  useEffect(() => {
    if (state.projectId) {
      updateSettings({ lastProjectId: state.projectId });
    }
  }, [state.projectId, updateSettings]);

  // ── Navigation actions ──────────────────────────────────────────────────

  const navigateToProject = useCallback(
    (projectId: string) => {
      dispatch({ type: "PROJECT_SWITCH", projectId });
    },
    []
  );

  const navigateToChat = useCallback(
    (chatId: string) => {
      dispatch({ type: "CHAT_SELECT", chatId });
    },
    []
  );

  const navigateToLog = useCallback(
    (logId: string) => {
      dispatch({ type: "LOG_SELECT", logId });
    },
    []
  );

  const navigateToNewChat = useCallback(async () => {
    dispatch({ type: "NEW_CHAT_REQUESTED" });
  }, []);

  const navigateToDeleteChat = useCallback(
    async (chatId: string) => {
      dispatch({ type: "CHAT_DELETE_REQUESTED", chatId });
    },
    []
  );

  const navigateToRenameChat = useCallback(
    async (chatId: string, name: string) => {
      dispatch({ type: "CHAT_RENAME_REQUESTED", chatId, name });
    },
    []
  );

  const navigateToPage = useCallback(
    (page: Page) => {
      dispatch({ type: "PAGE_SET", page });
    },
    []
  );

  const value = useMemo(
    () => ({
      state,
      activeProjectId: state.projectId,
      logId: state.logId,
      navigateToProject,
      navigateToChat,
      navigateToLog,
      navigateToNewChat,
      navigateToDeleteChat,
      navigateToRenameChat,
      navigateToPage,
      dispatch,
    }),
    [state, navigateToProject, navigateToChat, navigateToLog, navigateToNewChat, navigateToDeleteChat, navigateToRenameChat, navigateToPage, dispatch]
  );

  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) {
    throw new Error("useNav must be used within a NavProvider");
  }
  return ctx;
}
