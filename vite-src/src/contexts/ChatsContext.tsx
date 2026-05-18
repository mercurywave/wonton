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
import { useNav } from "./NavContext";
import { useAgentsContext } from "./AgentsContext";
import { isNeutralinoConnected } from "../utils/neuUtils";
import { getAvailableTools } from "../tools";
import { ChatMessage, ChatMeta, ToolDefinition } from "../types/chat";

interface ChatsContextValue {
  chats: ChatMeta[];
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistoryMessages: boolean;
  historyMessages: Record<string, ChatMessage[]>;
  loadHistoryMessages: () => Promise<void>;
  chatExecutionIds: Map<string, string>;
  createChat: () => Promise<ChatMeta>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, name: string) => Promise<void>;
  loadChatMessages: (chatId: string) => Promise<ChatMessage[]>;
  setChatDraft: (chatId: string, draft: string) => Promise<void>;
  refreshChats: () => Promise<ChatMeta[]>;
  sendMessage: (content: string, modelId: string) => Promise<void>;
  stopGeneration: () => void;
  updateChatMeta: (projectId: string, chatId: string, updates: Partial<ChatMeta>) => Promise<void>;
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const projectsCtx = useProjects();
  const { activeProjectId, logId: navLogId, dispatch: navDispatch } = useNav();
  const { settings } = useSettings();
  const { allAgents } = useAgentsContext();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

  const {
    chats,
    projectMeta,
    createChat,
    deleteChat,
    renameChat,
    loadChatMessages,
    setChatDraft,
    refreshChats,
    setChatExecutionId,
    chatExecutionIds,
    updateChatMeta: projectChatsUpdateChatMeta,
  } = useProjectChats(
    isNeutralinoConnected() ? (activeProjectId ?? undefined) : undefined
  );

  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const activeProject = useMemo(
    () => projectsCtx.projects.find((p) => p.id === activeProjectId),
    [projectsCtx.projects, activeProjectId]
  );

  const availableTools: ToolDefinition[] = useMemo(
    () => getAvailableTools(activeProject?.folderPath),
    [activeProject?.folderPath]
  );

  // Derive logId from the selected chat's meta
  const selectedChatMeta = useMemo(() => {
    if (!selectedChatId) return undefined;
    const chat = chats.find((c) => c.id === selectedChatId);
    return chat;
  }, [chats, selectedChatId]);

  // Active logId: navLogId if set (explicit log selection), otherwise fall back to chat's main log
  const activeLogId = useMemo(() => {
    if (navLogId) return navLogId;
    return selectedChatMeta?.logId;
  }, [navLogId, selectedChatMeta]);

  // Resolve the selected agent's system prompt
  const activeAgentSystemPrompt = useMemo(() => {
    if (!selectedChatId) return undefined;
    const chat = chats.find((c) => c.id === selectedChatId);
    if (!chat?.activeAgentId) return undefined;
    const agent = allAgents.find((a) => a.id === chat.activeAgentId);
    return agent?.systemPrompt;
  }, [chats, selectedChatId, allAgents]);

  const refreshAndNotify = useCallback(async () => {
    await refreshChats();
    const refreshedChat = chatsRef.current.find((c) => c.id === selectedChatId);
    if (refreshedChat) {
      navDispatch({ type: "CHAT_CREATED", chat: refreshedChat });
    }
  }, [refreshChats, selectedChatId, navDispatch]);

  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    settings,
    chatExecutionIds,
    setChatExecutionId,
    selectedChatId || undefined,
    isNeutralinoConnected() ? (activeProjectId ?? undefined) : undefined,
    projectMeta || undefined,
    activeAgentSystemPrompt,
    async (chatId: string, name: string) => {
      projectChatsUpdateChatMeta(chatId, { name });
    },
    availableTools,
    activeProject?.folderPath,
    activeLogId,
    refreshAndNotify,
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

  const wrappedCreateChat = useCallback(async (): Promise<ChatMeta> => {
    const chat = await createChat();
    navDispatch({ type: "CHAT_CREATED", chat });
    return chat;
  }, [createChat, navDispatch]);

  const wrappedDeleteChat = useCallback(async (chatId: string) => {
    await deleteChat(chatId);
    navDispatch({ type: "CHAT_DELETED", chatId });
  }, [deleteChat, navDispatch]);

  const wrappedRenameChat = useCallback(async (chatId: string, name: string) => {
    const now = Date.now();
    await renameChat(chatId, name);
    navDispatch({ type: "CHAT_RENAMED", chatId, name, updatedAt: now });
  }, [renameChat, navDispatch]);

  const value = useMemo(
    () => ({
      chats,
      messages,
      isLoading,
      isLoadingHistoryMessages,
      historyMessages,
      loadHistoryMessages,
      chatExecutionIds,
      createChat: wrappedCreateChat,
      deleteChat: wrappedDeleteChat,
      renameChat: wrappedRenameChat,
      loadChatMessages,
      setChatDraft,
      refreshChats,
      sendMessage,
      stopGeneration,
      updateChatMeta: (_projectId: string, chatId: string, updates: Partial<ChatMeta>) => projectChatsUpdateChatMeta(chatId, updates),
      selectedChatId,
      setSelectedChatId,
    }),
    [chats, messages, isLoading, isLoadingHistoryMessages, historyMessages, loadHistoryMessages, chatExecutionIds, wrappedCreateChat, wrappedDeleteChat, wrappedRenameChat, loadChatMessages, setChatDraft, refreshChats, sendMessage, stopGeneration, selectedChatId]
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
