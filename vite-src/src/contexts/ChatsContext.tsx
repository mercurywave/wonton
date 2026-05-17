import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
} from "react";
import { useProjectChats } from "../hooks/useProjectChats";
import { useChatApi } from "../hooks/useChatApi";
import { useSettings } from "./SettingsContext";
import { useProjects } from "./ProjectsContext";
import { useAgentsContext } from "./AgentsContext";
import { isNeutralinoConnected } from "../utils/neuUtils";
import { getAvailableTools } from "../tools";
import { ChatMessage, ChatMeta, ToolDefinition } from "../types/chat";

interface ChatsContextValue {
  chats: ChatMeta[];
  activeChatId: string | null;
  activeChat: ChatMeta | undefined;
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistoryMessages: boolean;
  historyMessages: Record<string, ChatMessage[]>;
  loadHistoryMessages: () => Promise<void>;
  chatExecutionIds: Map<string, string>;
  createChat: () => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, name: string) => Promise<void>;
  setActiveChat: (chatId: string) => void;
  loadChatMessages: (chatId: string) => Promise<ChatMessage[]>;
  setChatDraft: (chatId: string, draft: string) => Promise<void>;
  refreshChats: () => Promise<void>;
  sendMessage: (content: string, modelId: string) => Promise<void>;
  stopGeneration: () => void;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const { activeProjectId, projects, initialized } = useProjects();
  const { settings } = useSettings();
  const { allAgents } = useAgentsContext();

  const {
    chats,
    activeChatId,
    activeChat,
    projectMeta,
    createChat,
    deleteChat,
    renameChat,
    setActiveChat,
    loadChatMessages,
    setChatDraft,
    refreshChats,
    setChatExecutionId,
    chatExecutionIds,
  } = useProjectChats(
    isNeutralinoConnected() ? activeProjectId : undefined,
    initialized
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  const activeAgentSystemPrompt = useMemo(() => {
    if (!activeChat?.activeAgentId) return undefined;
    const agent = allAgents.find((a) => a.id === activeChat.activeAgentId);
    return agent?.systemPrompt;
  }, [activeChat?.activeAgentId, allAgents]);

  const availableTools: ToolDefinition[] = useMemo(
    () => getAvailableTools(activeProject?.folderPath),
    [activeProject?.folderPath]
  );

  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    settings,
    chatExecutionIds,
    setChatExecutionId,
    activeChat,
    isNeutralinoConnected() ? activeProjectId : undefined,
    projectMeta || undefined,
    activeAgentSystemPrompt,
    renameChat,
    availableTools,
    activeProject?.folderPath,
  );

  const [historyMessages, setHistoryMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingHistoryMessages, setIsLoadingHistoryMessages] = useState(false);
  const historyLoadedRef = useRef(false);

  const loadHistoryMessages = useCallback(async () => {
    if (!isNeutralinoConnected()) return;
    setIsLoadingHistoryMessages(true);
    const remaining: Record<string, ChatMessage[]> = {};
    for (const chat of chats) {
      if (!(chat.id in historyMessages)) {
        const msgs = await loadChatMessages(chat.id);
        remaining[chat.id] = msgs;
      }
    }
    if (Object.keys(remaining).length > 0) {
      setHistoryMessages((prev) => ({ ...prev, ...remaining }));
    }
    historyLoadedRef.current = true;
    setIsLoadingHistoryMessages(false);
  }, [chats, historyMessages, loadChatMessages]);

  const value = useMemo(
    () => ({
      chats,
      activeChatId,
      activeChat,
      messages,
      isLoading,
      isLoadingHistoryMessages,
      historyMessages,
      loadHistoryMessages,
      chatExecutionIds,
      createChat,
      deleteChat,
      renameChat,
      setActiveChat,
      loadChatMessages,
      setChatDraft,
      refreshChats,
      sendMessage,
      stopGeneration,
    }),
    [chats, activeChatId, activeChat, messages, isLoading, isLoadingHistoryMessages, historyMessages, loadHistoryMessages, chatExecutionIds, createChat, deleteChat, renameChat, setActiveChat, loadChatMessages, setChatDraft, refreshChats, sendMessage, stopGeneration]
  );

  return <ChatsContext.Provider value={value}>{children}</ChatsContext.Provider>;
}

export function useChats(): ChatsContextValue {
  const ctx = useContext(ChatsContext);
  if (!ctx) {
    throw new Error("useChats must be used within a ChatsProvider");
  }
  return ctx;
}
