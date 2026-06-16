import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useMemo,
  useEffect,
} from "react";
import { useProjectChats } from "../hooks/useProjectChats";
import { useChatApi } from "../hooks/useChatApi";
import { useChatWorkflow, executeCommand as runExecuteCommand } from "../hooks/useChatWorkflow";
import { useEventBus } from "./EventBusContext";
import { useSettings } from "./SettingsContext";
import { useProjects } from "./ProjectsContext";
import { useNav } from "./NavContext";
import { useAgentsContext } from "./AgentsContext";
import { useFlowsContext } from "./FlowsContext";
import { FeedbackPayload, useFeedback } from "./FeedbackContext";
import { isBackendConnected } from "../utils/platformUtils";
import { ChatMessage, ChatMeta, FlowActionButton, ReasoningEffort } from "../types/chat";
import { chatLogsStore } from "../store/chatLogs";
import { chatStore } from "../store/chats";

interface ChatsContextValue {
  chats: ChatMeta[];
  messages: ChatMessage[];
  isLoading: boolean;
  isLoadingHistoryMessages: boolean;
  historyMessages: Record<string, ChatMessage[]>;
  loadHistoryMessages: () => Promise<void>;
  getIsProcessing: (chatId: string) => boolean;
  createChat: (workflowId?: string, workflowStateKey?: string) => Promise<ChatMeta>;
  deleteChat: (chatId: string) => Promise<void>;
  renameChat: (chatId: string, name: string) => Promise<void>;
  loadChatMessages: (chatId: string) => Promise<ChatMessage[]>;
  refreshChats: () => Promise<ChatMeta[]>;
  sendMessage: (content: string, modelId: string) => Promise<void>;
  stopGeneration: () => void;
  updateChatMeta: (projectId: string, chatId: string, updates: Partial<ChatMeta>) => Promise<void>;
  setWorkflowId: (chatId: string, workflowId: string | undefined) => Promise<void>;
  setSelectedChatWorkflowId: (workflowId: string | undefined, workflowStateKey?: string) => Promise<void>;
  executeAdjustPrompt: (content: string) => Promise<string>;
  onActionButtonClick: (button: FlowActionButton, logId?: string) => Promise<void>;
  executeCommand: (flowId: string) => Promise<void>;
  onUserMessageAction: (params: { chatId: string; messageId: string; action: 'copy' | 'rollback' }) => Promise<void>;
  selectedChatId: string | null;
  setSelectedChatId: (id: string | null) => void;
  activeAgentId: string;
  activeModel: string;
  onAgentChange: (agentId: string) => Promise<void>;
  onModelChange: (modelId: string) => Promise<void>;
  activeReasoningEffort: ReasoningEffort;
  onReasoningEffortChange: (effort: ReasoningEffort) => Promise<void>;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const projectsCtx = useProjects();
  const { activeProjectId, logId: navLogId, dispatch } = useNav();
  const { settings } = useSettings();
  const { allAgents } = useAgentsContext();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const { flows } = useFlowsContext();
  const { emit: emitEvent } = useEventBus();
  const { showFeedback: showFeedbackBase } = useFeedback();

  const {
    chats,
    projectMeta,
    createChat,
    deleteChat,
    renameChat,
    loadChatMessages,
    refreshChats,
    updateChatMeta: projectChatsUpdateChatMeta,
  } = useProjectChats(
    isBackendConnected() ? (activeProjectId ?? undefined) : undefined
  );

  // Auto-select most recent chat when the currently selected one is deleted
  useEffect(() => {
    if (selectedChatId && chats.some((c) => c.id === selectedChatId)) return;
    if (chats.length === 0) {
      setSelectedChatId(null);
      return;
    }
    const mostRecent = chats.reduce((a, b) =>
      a.updatedAt > b.updatedAt ? a : b
    );
    setSelectedChatId(mostRecent.id);
  }, [selectedChatId, chats]);

  // Derive logId from the selected chat's meta
  const selectedChatMeta = useMemo(() => {
    if (!selectedChatId) return undefined;
    const chat = chats.find((c) => c.id === selectedChatId);
    return chat;
  }, [chats, selectedChatId]);

  const chatsRef = useRef(chats);
  chatsRef.current = chats;

  const activeProject = useMemo(
    () => projectsCtx.projects.find((p) => p.id === activeProjectId),
    [projectsCtx.projects, activeProjectId]
  );

  // Resolve the effective active agent ID (chat override or builtin default)
  const activeAgentId = useMemo(() => {
    if (!selectedChatMeta) return "builtin:default";
    return selectedChatMeta.activeAgentId || "builtin:default";
  }, [selectedChatMeta]);

  // Resolve the effective active model (chat override or settings default)
  const activeModel = useMemo(() => {
    if (!selectedChatMeta) return settings.defaultModel;
    return selectedChatMeta.activeModel ?? settings.defaultModel;
  }, [selectedChatMeta, settings.defaultModel]);

  // Callback to change the active agent for the selected chat
  const onAgentChange = useCallback(
    async (agentId: string) => {
      if (!selectedChatId || !activeProjectId) return;
      if (agentId !== "builtin:default") {
        await projectChatsUpdateChatMeta(selectedChatId, { activeAgentId: agentId });
      } else {
        await projectChatsUpdateChatMeta(selectedChatId, { activeAgentId: undefined });
      }
    },
    [selectedChatId, activeProjectId]
  );

  // Callback to change the active model for the selected chat
  const onModelChange = useCallback(
    async (modelId: string) => {
      if (!selectedChatId || !activeProjectId) return;
      if (modelId !== settings.defaultModel) {
        await projectChatsUpdateChatMeta(selectedChatId, { activeModel: modelId });
      } else {
        await projectChatsUpdateChatMeta(selectedChatId, { activeModel: undefined });
      }
    },
    [selectedChatId, activeProjectId, settings.defaultModel]
  );

  // Resolve the effective active reasoning effort (chat override or settings default)
  const activeReasoningEffort = useMemo(() => {
    if (!selectedChatMeta) return settings.reasoningEffort;
    return selectedChatMeta.reasoningEffort ?? settings.reasoningEffort;
  }, [selectedChatMeta, settings.reasoningEffort]);

  // Callback to change the active reasoning effort for the selected chat
  const onReasoningEffortChange = useCallback(
    async (effort: ReasoningEffort) => {
      if (!selectedChatId || !activeProjectId) return;
      if (effort !== settings.reasoningEffort) {
        await projectChatsUpdateChatMeta(selectedChatId, { reasoningEffort: effort });
      } else {
        await projectChatsUpdateChatMeta(selectedChatId, { reasoningEffort: undefined });
      }
    },
    [selectedChatId, activeProjectId, settings.reasoningEffort]
  );

  // Active logId: navLogId if set (explicit log selection), otherwise fall back to chat's main log
  const activeLogId = useMemo(() => {
    if (navLogId) return navLogId;
    return selectedChatMeta?.logId;
  }, [navLogId, selectedChatMeta]);

  // Resolve the selected agent's system prompt and full agent object
  const activeAgentSystemPrompt = useMemo(() => {
    if (!selectedChatMeta?.activeAgentId) return undefined;
    const agent = allAgents.find((a) => a.id === selectedChatMeta.activeAgentId);
    return agent?.systemPrompt;
  }, [selectedChatMeta, allAgents]);

  const refreshAndNotify = useCallback(async () => {
    await refreshChats();
  }, [refreshChats]);

  // Wrapped showFeedback that navigates to the chat+log before showing the popup
  const wrappedShowFeedback = useCallback(
    async (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => {
      // Navigate to the chat so the user sees the popup
      dispatch({ type: "CHAT_SELECT_WITH_LOG", chatId, logId });
      return showFeedbackBase(projectId, chatId, logId, payload);
    },
    [showFeedbackBase, dispatch]
  );

  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    settings,
    selectedChatId || undefined,
    isBackendConnected() ? (activeProjectId ?? undefined) : undefined,
    projectMeta || undefined,
    activeAgentSystemPrompt,
    async (chatId: string, name: string) => {
      projectChatsUpdateChatMeta(chatId, { name });
    },
    activeProject?.folderPath,
    activeLogId,
    refreshAndNotify,
    () => workflowExecuteOnSendPrompt(),
    (response: ChatMessage) => workflowExecuteOnChatResponse(response),
    selectedChatMeta?.activeAgentId,
    allAgents,
    wrappedShowFeedback,
    activeReasoningEffort,
  );

  // Workflow execution for the selected chat
  const selectedChatForWorkflow = selectedChatMeta;

  const {
    executeAdjustPrompt: workflowExecuteAdjustPrompt,
    onSendPrompt: workflowExecuteOnSendPrompt,
    onChatResponse: workflowExecuteOnChatResponse,
    onActionButtonClick: workflowOnActionButtonClick,
    advance,
  } = useChatWorkflow({
    workflowId: selectedChatForWorkflow?.workflowId,
    workflowStateKey: selectedChatForWorkflow?.workflowStateKey,
    flows,
    chatId: selectedChatId || undefined,
    projectId: activeProjectId || undefined,
    showFeedback: wrappedShowFeedback,
  });

  const wrappedSendMessage = useCallback(
    async (content: string, modelId: string) => {
      const adjusted = await workflowExecuteAdjustPrompt(content, modelId);
      await sendMessage(adjusted, modelId, (adjusted !== content) ? content : undefined);
    },
    [workflowExecuteAdjustPrompt, sendMessage]
  );

  const [historyMessages, setHistoryMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingHistoryMessages, setIsLoadingHistoryMessages] = useState(false);
  const historyLoadedRef = useRef(false);

  const loadHistoryMessages = useCallback(async () => {
    if (!isBackendConnected()) return;
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

  const wrappedCreateChat = useCallback(async (workflowId?: string, workflowStateKey?: string): Promise<ChatMeta> => {
    return await createChat(workflowId, workflowStateKey);
  }, [createChat]);

  const wrappedDeleteChat = useCallback(async (chatId: string) => {
    await deleteChat(chatId);
  }, [deleteChat]);

  const wrappedRenameChat = useCallback(async (chatId: string, name: string) => {
    await renameChat(chatId, name);
  }, [renameChat]);

  const wrappedSetWorkflowId = useCallback(async (chatId: string, workflowId: string | undefined) => {
    await projectChatsUpdateChatMeta(chatId, { workflowId, updatedAt: Date.now() });
  }, [projectChatsUpdateChatMeta]);

  const setSelectedChatWorkflowId = useCallback(async (workflowId: string | undefined, workflowStateKey?: string) => {
    if (!selectedChatId) return;
    const updates: Partial<ChatMeta> = { workflowId, updatedAt: Date.now() };
    if (workflowStateKey !== undefined) {
      updates.workflowStateKey = workflowStateKey;
    }
    await projectChatsUpdateChatMeta(selectedChatId, updates);
  }, [selectedChatId, projectChatsUpdateChatMeta]);

  const wrappedExecuteCommand = useCallback(
    async (flowId: string) => {
      const flow = flows.find((f) => f.id === flowId);
      if (!flow?.command) return;
      if (!selectedChatId || !activeProjectId) return;
      await runExecuteCommand(flow.command, flowId, selectedChatId, activeProjectId, emitEvent, wrappedShowFeedback);
    },
    [flows, selectedChatId, activeProjectId, emitEvent, wrappedShowFeedback]
  );

  const getIsProcessing = useCallback((chatId: string) => {
    if (!activeProjectId) return false;
    const chat = chats.find((c) => c.id === chatId);
    if (!chat?.logId) return false;
    return chatLogsStore.getPendingMessage(activeProjectId, chat.logId) !== undefined;
  }, [activeProjectId, chats]);

  const onUserMessageAction = useCallback(async (params: { chatId: string; messageId: string; action: 'copy' | 'rollback' }) => {
    const { chatId: actionChatId, messageId, action } = params;

    if (action === 'copy') {
      const chat = chats.find((c) => c.id === actionChatId);
      if (!chat?.logId || !activeProjectId) return;
      const messages = chatLogsStore.getLog(activeProjectId, chat.logId);
      const msg = messages?.find(m => m.id === messageId);
      if (msg) {
        await navigator.clipboard.writeText(msg.content);
      }
      return;
    }

    if (action === 'rollback') {
      if (!activeProjectId) return;
      const chat = chats.find((c) => c.id === actionChatId);
      if (!chat?.logId) return;

      const messages = chatLogsStore.getLog(activeProjectId, chat.logId);
      if (!messages) return;

      const msgIndex = messages.findIndex(m => m.id === messageId);
      if (msgIndex === -1) return;

      const rollbackMessage = messages[msgIndex];
      if (rollbackMessage.role !== 'user') return;

      // Truncate messages to before the selected message
      const truncatedMessages = messages.slice(0, msgIndex);

      // Create new version log
      const newLogId = await chatStore.createNewVersionLog(activeProjectId, actionChatId);
      if (!newLogId) return;

      // Write truncated messages to the new log
      await chatLogsStore.replaceLog(activeProjectId, newLogId, truncatedMessages);

      // Set draft to the rollback message content for editing
      await projectChatsUpdateChatMeta(actionChatId, { draft: rollbackMessage.content });
    }
  }, [chats, activeProjectId, projectChatsUpdateChatMeta]);

  // Fire onEnter for the initial state when a workflow is linked
  useEffect(() => {
    if (selectedChatForWorkflow?.workflowId && selectedChatForWorkflow?.workflowStateKey) {
      advance(selectedChatForWorkflow.workflowStateKey);
    }
  }, [selectedChatForWorkflow?.workflowId, selectedChatForWorkflow?.workflowStateKey, advance]);

  const value = useMemo(
    () => ({
      chats,
      messages,
      isLoading,
      isLoadingHistoryMessages,
      historyMessages,
      loadHistoryMessages,
      getIsProcessing,
      createChat: wrappedCreateChat,
      deleteChat: wrappedDeleteChat,
      renameChat: wrappedRenameChat,
      loadChatMessages,
      refreshChats,
      sendMessage: wrappedSendMessage,
      stopGeneration,
      updateChatMeta: (_projectId: string, chatId: string, updates: Partial<ChatMeta>) => projectChatsUpdateChatMeta(chatId, updates),
      setWorkflowId: wrappedSetWorkflowId,
      setSelectedChatWorkflowId,
      executeAdjustPrompt: workflowExecuteAdjustPrompt,
      onActionButtonClick: workflowOnActionButtonClick,
      executeCommand: wrappedExecuteCommand,
      onUserMessageAction,
      selectedChatId,
      setSelectedChatId,
      activeAgentId,
      activeModel,
      onAgentChange,
      onModelChange,
      activeReasoningEffort,
      onReasoningEffortChange,
    }),
    [chats, messages, isLoading, isLoadingHistoryMessages, historyMessages, loadHistoryMessages, getIsProcessing, wrappedCreateChat, wrappedDeleteChat, wrappedRenameChat, loadChatMessages, refreshChats, wrappedSendMessage, stopGeneration, onUserMessageAction, selectedChatId, wrappedSetWorkflowId, setSelectedChatWorkflowId, workflowExecuteAdjustPrompt, workflowExecuteOnSendPrompt, workflowExecuteOnChatResponse, workflowOnActionButtonClick, wrappedExecuteCommand, advance, wrappedShowFeedback, activeAgentId, activeModel, onAgentChange, onModelChange, activeReasoningEffort, onReasoningEffortChange]
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
