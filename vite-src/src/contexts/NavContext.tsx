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
import { ChatMeta, Page, ProjectMeta } from "../types/chat";
import { navReducer, NavState, Action } from "./navReducer";
import { useSettings } from "./SettingsContext";
import { useProjects } from "./ProjectsContext";
import { loadProjectMeta, listChatMeta } from "../hooks/useChatPersistence";
import { isNeutralinoConnected } from "../utils/neuUtils";

export interface NavContextValue {
  state: NavState;
  activeProjectId: string | null;
  navigateToProject: (projectId: string) => void;
  navigateToChat: (chatId: string) => void;
  navigateToNewChat: () => Promise<void>;
  navigateToDeleteChat: (chatId: string) => Promise<void>;
  navigateToRenameChat: (chatId: string, name: string) => Promise<void>;
  navigateToModelChange: (chatId: string, model: string) => Promise<void>;
  navigateToAgentChange: (chatId: string, agentId: string) => Promise<void>;
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
    chat: null,
    page: "chat" as Page,
    model: null,
    agentId: null,
    projectMeta: null,
    chats: [],
    projects: [],
    status: "initializing",
    error: null,
  };

  const [state, dispatch] = useReducer(navReducer, initialState);
  const loadCountRef = useRef(0);
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

  // ── Side effect: when project switch is dispatched, load data ───────────
  useEffect(() => {
    if (state.status !== "loading" || !state.projectId) return;

    const currentLoad = ++loadCountRef.current;
    const projectId = state.projectId;

    Promise.all([
      loadProjectMeta(projectId).catch(() => ({} as ProjectMeta)),
      isNeutralinoConnected() ? listChatMeta(projectId) : Promise.resolve([] as ChatMeta[]),
    ]).then(([meta, chats]) => {
      // Guard against stale results
      if (currentLoad !== loadCountRef.current) return;
      if (state.projectId !== projectId) return;

      dispatch({
        type: "PROJECT_DATA_LOADED",
        projectId,
        meta,
        chats,
      });
    });
  }, [state.status, state.projectId]);

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

  const navigateToNewChat = useCallback(async () => {
    if (!state.projectId) return;
    dispatch({ type: "NEW_CHAT_REQUESTED" });
  }, [state.projectId]);

  const navigateToDeleteChat = useCallback(
    async (chatId: string) => {
      if (!state.projectId) return;
      dispatch({ type: "CHAT_DELETE_REQUESTED", chatId });
    },
    [state.projectId]
  );

  const navigateToRenameChat = useCallback(
    async (chatId: string, name: string) => {
      if (!state.projectId) return;
      dispatch({ type: "CHAT_RENAME_REQUESTED", chatId, name });
    },
    [state.projectId]
  );

 const navigateToModelChange = useCallback(
    async (chatId: string, modelId: string) => {
      if (!state.projectId) return;
      dispatch({ type: "CHAT_MODEL_CHANGE", chatId, model: modelId === settings.defaultModel ? undefined : modelId });
    },
    [state.projectId, settings.defaultModel]
  );

  const navigateToAgentChange = useCallback(
    async (chatId: string, agentId: string) => {
      if (!state.projectId) return;
      dispatch({ type: "CHAT_AGENT_CHANGE", chatId, agentId: agentId === "builtin:default" ? undefined : agentId });
    },
    [state.projectId]
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
      navigateToProject,
      navigateToChat,
      navigateToNewChat,
      navigateToDeleteChat,
      navigateToRenameChat,
      navigateToModelChange,
      navigateToAgentChange,
      navigateToPage,
      dispatch,
    }),
    [state, navigateToProject, navigateToChat, navigateToNewChat, navigateToDeleteChat, navigateToRenameChat, navigateToModelChange, navigateToAgentChange, navigateToPage, dispatch]
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
