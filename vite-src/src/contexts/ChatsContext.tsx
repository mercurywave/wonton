import { createContext, useContext, useState, useCallback, useRef, ReactNode, useMemo, useEffect } from "react";
import { useProjectChats } from "../hooks/useProjectChats";
import { useChatApi } from "../hooks/useChatApi";
import { useChatWorkflow, submitChatPrompt, executeCommand as runExecuteCommand } from "../hooks/useChatWorkflow";
import { useSettings } from "./SettingsContext";
import { useProjects } from "./ProjectsContext";
import { useNav } from "./NavContext";
import { useAgentsContext } from "./useAgentsContext";
import { useFlowsContext } from "./FlowsContext";
import { useToolsContext } from "./ToolsContext";
import { FeedbackPayload, useFeedback } from "./FeedbackContext";
import { useNotificationsContext } from "./NotificationsContext";
import { isBackendConnected } from "../utils/platformUtils";
import { Agent, ChatMessage, ChatMeta, FlowActionButton, ReasoningEffort, SubagentMeta } from "../types/chat";
import { combineCustomTools, getPresetCommandTools } from "../utils/customTools";
import { chatLogsStore } from "../store/chatLogs";
import { chatStore } from "../store/chats";
import { on as onEvent } from "./EventBusContext";

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
  enabledToolNames: string[];
  onToolSetChange: (toolNames: string[]) => Promise<void>;
  // Effective values when viewing a subagent log (resolved from subagent meta)
  effectiveAgent: Agent | undefined;
  effectiveToolNames: string[];
  // Whether the currently selected log is the main chat log
  isMainLog: boolean;
  // Whether a workflow hook is currently executing (for stop button)
  isWorkflowExecuting: boolean;
  // Suggested follow-up prompts for the current chat
  suggestedFollowUps: string[];
  clearSuggestedFollowUps: () => void;
  insertSuggestion: (suggestion: string, setDraft: (draft: string) => void) => void;
}

const ChatsContext = createContext<ChatsContextValue | null>(null);

export function ChatsProvider({ children }: { children: ReactNode }) {
  const projectsCtx = useProjects();
  const { activeProjectId, logId: navLogId, dispatch } = useNav();
  const { settings, resolvedSettings } = useSettings();
  const { allAgents } = useAgentsContext();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const initialAutoSelectDone = useRef(false);
  const { flows } = useFlowsContext();
 
  const { showFeedback: showFeedbackBase } = useFeedback();
  const { showNotification } = useNotificationsContext();

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

  // Compute the resolved chat ID based on current chats (no side effects)
  const resolvedChatId = useMemo(() => {
    if (selectedChatId && chats.some((c) => c.id === selectedChatId)) return selectedChatId;
    if (chats.length === 0) return null;
    const mostRecent = chats.reduce((a, b) =>
      a.updatedAt > b.updatedAt ? a : b
    );
    return mostRecent.id;
  }, [selectedChatId, chats]);

  // Dispatch CHAT_SELECT action on initial mount (runs once)
  useEffect(() => {
    if (!initialAutoSelectDone.current && resolvedChatId) {
      initialAutoSelectDone.current = true;
      dispatch({ type: "CHAT_SELECT", chatId: resolvedChatId });
    }
  }, [resolvedChatId, dispatch]);

  // Derive logId from the selected chat's meta
  const selectedChatMeta = useMemo(() => {
    if (!resolvedChatId) return undefined;
    const chat = chats.find((c) => c.id === resolvedChatId);
    return chat;
  }, [chats, resolvedChatId]);

  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const activeProject = useMemo(
    () => projectsCtx.projects.find((p) => p.id === activeProjectId),
    [projectsCtx.projects, activeProjectId]
  );

  // Resolve the effective active agent ID (chat override or builtin default)
  const activeAgentId = useMemo(() => {
    if (!selectedChatMeta) return "builtin:default";
    return selectedChatMeta.activeAgentId || "builtin:default";
  }, [selectedChatMeta]);

  // Resolve the active subagent meta when viewing a subagent log
  const activeSubagentMeta = useMemo(() => {
    if (!navLogId || !selectedChatMeta) return null;
    if (navLogId === selectedChatMeta.logId) return null;
    return selectedChatMeta.subagents?.find((s) => s.logId === navLogId) ?? null;
  }, [navLogId, selectedChatMeta]);

  // Resolve the active version history entry when viewing a version log
  const activeVersionEntry = useMemo(() => {
    if (!navLogId || !selectedChatMeta) return null;
    if (navLogId === selectedChatMeta.logId) return null;
    if (navLogId === selectedChatMeta.queriesLogId) return null;
    return selectedChatMeta.versionHistory?.find((v) => v.logId === navLogId) ?? null;
  }, [navLogId, selectedChatMeta]);

  // Resolve the effective active model (subagent > version > chat > settings)
  const activeModel = useMemo(() => {
    if (!selectedChatMeta) return resolvedSettings.defaultModel;
    if (activeSubagentMeta?.model) return activeSubagentMeta.model;
    if (activeVersionEntry?.model) return activeVersionEntry.model;
    return selectedChatMeta.activeModel ?? resolvedSettings.defaultModel;
  }, [selectedChatMeta, activeSubagentMeta, activeVersionEntry, resolvedSettings.defaultModel]);

  // Resolve the effective agent for display (subagent > version > chat > builtin:default)
  const effectiveAgent = useMemo(() => {
    if (!selectedChatMeta) return allAgents.find((a) => a.id === "builtin:default");
    if (activeSubagentMeta) {
      return allAgents.find((a) => a.id === activeSubagentMeta.agentId);
    }
    if (activeVersionEntry?.agentId) {
      return allAgents.find((a) => a.id === activeVersionEntry.agentId);
    }
    const agentId = selectedChatMeta.activeAgentId || "builtin:default";
    return allAgents.find((a) => a.id === agentId);
  }, [selectedChatMeta, activeSubagentMeta, activeVersionEntry, allAgents]);

  // Resolve the effective tool names for display (subagent override, chat override, or settings)
  const effectiveToolNames = useMemo(() => {
    if (activeSubagentMeta) {
      return activeSubagentMeta.toolSet || [];
    }
    return selectedChatMeta?.enabledToolNames || [];
  }, [selectedChatMeta, activeSubagentMeta]);

  // Callback to change the active agent for the selected chat
  const onAgentChange = useCallback(
    async (agentId: string) => {
      if (!resolvedChatId || !activeProjectId) return;
      if (agentId !== "builtin:default") {
        await projectChatsUpdateChatMeta(resolvedChatId, { activeAgentId: agentId });
      } else {
        await projectChatsUpdateChatMeta(resolvedChatId, { activeAgentId: undefined });
      }
    },
    [resolvedChatId, activeProjectId, projectChatsUpdateChatMeta]
  );

  // Helper to update a specific subagent's meta for the selected chat
  const updateSubagentMeta = useCallback(
    async (logId: string, partial: Partial<Pick<SubagentMeta, 'model' | 'thinking'>>) => {
      if (!resolvedChatId) return;
      const subagents = selectedChatMeta?.subagents || [];
      const updatedSubagents = subagents.map((s) =>
        s.logId === logId ? { ...s, ...partial } : s
      );
      await projectChatsUpdateChatMeta(resolvedChatId, { subagents: updatedSubagents });
    },
    [resolvedChatId, selectedChatMeta, projectChatsUpdateChatMeta]
  );

  // Callback to change the active model for the selected chat or subagent
  const onModelChange = useCallback(
    async (modelId: string) => {
      if (!resolvedChatId || !activeProjectId) return;
      if (activeSubagentMeta) {
        await updateSubagentMeta(activeSubagentMeta.logId, { model: modelId || undefined });
      } else if (modelId !== resolvedSettings.defaultModel) {
        await projectChatsUpdateChatMeta(resolvedChatId, { activeModel: modelId });
      } else {
        await projectChatsUpdateChatMeta(resolvedChatId, { activeModel: undefined });
      }
    },
    [resolvedChatId, activeProjectId, activeSubagentMeta, resolvedSettings.defaultModel, updateSubagentMeta, projectChatsUpdateChatMeta]
  );

  // Resolve the effective active reasoning effort (subagent > version > chat > settings)
  const activeReasoningEffort = useMemo(() => {
    if (!selectedChatMeta) return settings.reasoningEffort;
    if (activeSubagentMeta?.thinking !== undefined) return activeSubagentMeta.thinking;
    if (activeVersionEntry?.reasoningEffort !== undefined) return activeVersionEntry.reasoningEffort;
    return selectedChatMeta.reasoningEffort ?? settings.reasoningEffort;
  }, [selectedChatMeta, activeSubagentMeta, activeVersionEntry, settings.reasoningEffort]);

  // Callback to change the active reasoning effort for the selected chat or subagent
  const onReasoningEffortChange = useCallback(
    async (effort: ReasoningEffort) => {
      if (!resolvedChatId || !activeProjectId) return;
      if (activeSubagentMeta) {
        await updateSubagentMeta(activeSubagentMeta.logId, { thinking: effort });
      } else if (effort !== settings.reasoningEffort) {
        await projectChatsUpdateChatMeta(resolvedChatId, { reasoningEffort: effort });
      } else {
        await projectChatsUpdateChatMeta(resolvedChatId, { reasoningEffort: undefined });
      }
    },
    [resolvedChatId, activeProjectId, activeSubagentMeta, settings.reasoningEffort, updateSubagentMeta, projectChatsUpdateChatMeta]
  );

  // Resolve the effective enabled tool names for the selected chat
  const enabledToolNames = useMemo(() => {
    if (!selectedChatMeta) return [];
    return selectedChatMeta.enabledToolNames || [];
  }, [selectedChatMeta]);

  // Callback to change the enabled tools for the selected chat
  const onToolSetChange = useCallback(
    async (toolNames: string[]) => {
      if (!resolvedChatId || !activeProjectId) return;
      if (toolNames.length === 0) {
        await projectChatsUpdateChatMeta(resolvedChatId, { enabledToolNames: undefined });
      } else {
        await projectChatsUpdateChatMeta(resolvedChatId, { enabledToolNames: toolNames });
      }
    },
    [resolvedChatId, activeProjectId, projectChatsUpdateChatMeta]
  );

  // Active logId: navLogId if set (explicit log selection), otherwise fall back to chat's main log
  const activeLogId = useMemo(() => {
    if (navLogId) return navLogId;
    return selectedChatMeta?.logId;
  }, [navLogId, selectedChatMeta]);

  // Whether the currently selected log is the main chat log (not a subagent or version log)
  const isMainLog = useMemo(() => {
    if (!selectedChatMeta) return false;
    return !navLogId || navLogId === selectedChatMeta.logId;
  }, [navLogId, selectedChatMeta]);

  // Resolve the selected agent's system prompt and full agent object
  const activeAgentSystemPrompt = useMemo(() => {
    if (!selectedChatMeta?.activeAgentId) return undefined;
    const agent = allAgents.find((a) => a.id === selectedChatMeta.activeAgentId);
    return agent?.systemPrompt;
  }, [selectedChatMeta, allAgents]);

  // Suggested follow-up prompts - derived from chat meta
  // This is the persisted suggestions from the chat's metadata
  const persistedSuggestedFollowUps = useMemo(() => {
    return selectedChatMeta?.suggestedFollowUps || [];
  }, [selectedChatMeta?.suggestedFollowUps]);

  // Track when suggestions were cleared (to avoid showing stale suggestions after clear)
  const [clearedTimestamp, setClearedTimestamp] = useState<number>(0);

  // Epoch counter to prevent race conditions where background suggestion generation
  // overwrites cleared or newer state
  const [suggestionEpoch, setSuggestionEpoch] = useState<number>(0);

  // The active suggestions shown to the user (persisted or empty if cleared)
  // When clearedTimestamp is set, we return empty array until chat meta refreshes
  // When disableSuggestedFollowUps is enabled, always return empty
  const suggestedFollowUps = useMemo(() => {
    if (settings.disableSuggestedFollowUps) return [];
    if (clearedTimestamp > 0 && persistedSuggestedFollowUps.length > 0) {
      // If we just cleared and the persisted suggestions haven't refreshed yet, show empty
      // Once the chat meta refreshes, suggestedFollowUps will update automatically
      return [];
    }
    return persistedSuggestedFollowUps;
  }, [persistedSuggestedFollowUps, clearedTimestamp, settings.disableSuggestedFollowUps]);

  // Persist suggestions to chat meta
  const persistSuggestions = useCallback(async (suggestions: string[]) => {
    if (!resolvedChatId || !activeProjectId) return;
    await projectChatsUpdateChatMeta(resolvedChatId, { suggestedFollowUps: suggestions.length > 0 ? suggestions : undefined });
  }, [resolvedChatId, activeProjectId, projectChatsUpdateChatMeta]);

  const setSuggestedFollowUps = useCallback(async (suggestions: string[], epoch?: number) => {
    // Ignore stale suggestions that were generated before the current epoch
    if (epoch !== undefined && epoch < suggestionEpoch) return;
    
    // Update the chat meta directly
    await persistSuggestions(suggestions);
    // Clear the clearedTimestamp so the new suggestions are shown
    setClearedTimestamp(0);
  }, [persistSuggestions, suggestionEpoch]);

  const clearSuggestedFollowUps = useCallback(async () => {
    setClearedTimestamp(Date.now());
    // Increment epoch to invalidate any in-flight suggestion generation
    setSuggestionEpoch(e => e + 1);
    await persistSuggestions([]);
  }, [persistSuggestions]);

  const insertSuggestion = useCallback((suggestion: string, setDraft: (draft: string) => void) => {
    setDraft(suggestion);
    // Increment epoch to invalidate any in-flight suggestion generation from previous turn
    setSuggestionEpoch(e => e + 1);
  }, []);

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

  // Workflow execution for the selected chat
  const selectedChatForWorkflow = selectedChatMeta;

  const {
    executeAdjustPrompt: workflowExecuteAdjustPrompt,
    onActionButtonClick: workflowOnActionButtonClick,
    advance,
    currentFlow,
  } = useChatWorkflow({
    workflowId: selectedChatForWorkflow?.workflowId,
    workflowStateKey: selectedChatForWorkflow?.workflowStateKey,
    flows,
    chatId: selectedChatId || undefined,
    projectId: activeProjectId || undefined,
    showFeedback: wrappedShowFeedback,
  });

  // Abort controller for workflow hook cancellation
  const workflowAbortRef = useRef<AbortController | null>(null);

  // Track whether the current chat has an active workflow
  const isWorkflowActive = useMemo(() => {
    return Boolean(selectedChatMeta?.workflowId);
  }, [selectedChatMeta?.workflowId]);

  // Track whether a workflow hook is actively executing
  const isWorkflowExecutingRef = useRef(false);
  const [isWorkflowExecuting, setIsWorkflowExecuting] = useState(false);

  // Clean up abort controller when workflow is removed
  useEffect(() => {
    if (!isWorkflowActive && workflowAbortRef.current) {
      workflowAbortRef.current.abort();
      workflowAbortRef.current = null;
    }
  }, [isWorkflowActive]);

  // Listen for abortWorkflow event from stopGeneration
  useEffect(() => {
    const handler = () => {
      if (workflowAbortRef.current) {
        workflowAbortRef.current.abort();
        workflowAbortRef.current = null;
      }
    };
    return onEvent("abortWorkflow", handler);
  }, [isWorkflowActive]);

  const { tools: projectTools } = useToolsContext();

  const presetTools = useMemo(() => getPresetCommandTools(projectMeta || undefined), [projectMeta]);

  const workflowCustomTools = useMemo(() => {
    return combineCustomTools(projectTools, currentFlow?.tools, presetTools);
  }, [projectTools, currentFlow?.tools, presetTools]);

  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    resolvedSettings,
    resolvedChatId || undefined,
    isBackendConnected() ? (activeProjectId ?? undefined) : undefined,
    projectMeta || undefined,
    activeAgentSystemPrompt,
    async (chatId: string, name: string) => {
      projectChatsUpdateChatMeta(chatId, { name });
    },
    activeProject?.folderPath,
    activeLogId,
    refreshAndNotify,
    selectedChatMeta?.activeAgentId,
    allAgents,
    wrappedShowFeedback,
    activeReasoningEffort,
    workflowCustomTools,
    enabledToolNames,
    isMainLog,
    async (suggestions: string[]) => {
      await setSuggestedFollowUps(suggestions, suggestionEpoch);
    },
  );

  // Track previous isLoading to detect completion of user-initiated chats
  const prevIsLoadingRef = useRef(isLoading);

  // Trigger notification when user-initiated chat completes
  useEffect(() => {
    const prevIsLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;

    if (prevIsLoading && !isLoading && resolvedChatId) {
      const currentChats = chatsRef.current;
      const chat = currentChats.find((c) => c.id === resolvedChatId);
      const chatName = chat?.name || "Chat";
      const projectName = projectsCtx.projects.find((p) => p.id === activeProjectId)?.name || "";
      const title = projectName ? `${projectName} - ${chatName}` : chatName;
      showNotification("Response complete", title);
    }
  }, [isLoading, resolvedChatId, showNotification, selectedChatId, activeProjectId, projectsCtx.projects]);

  const wrappedSendMessage = useCallback(
    async (content: string, modelId: string) => {
      if (!activeProjectId || !resolvedChatId) return;
      
      // Clear suggestions before sending a new message
      await clearSuggestedFollowUps();
      
      // Create abort controller if workflow is active and none exists yet
      if (isWorkflowActive && !workflowAbortRef.current) {
        workflowAbortRef.current = new AbortController();
      }
      
      // Mark workflow as executing
      isWorkflowExecutingRef.current = true;
      setIsWorkflowExecuting(true);
      
      try {
        await submitChatPrompt({
          projectId: activeProjectId,
          chatId: resolvedChatId,
          prompt: content,
          showFeedback: wrappedShowFeedback,
          submit: async (processedPrompt, originalPrompt) => (
            await sendMessage(
              processedPrompt,
              modelId,
              processedPrompt !== originalPrompt ? originalPrompt : undefined,
            )
          ),
          abortController: workflowAbortRef.current || undefined,
        });
      } finally {
        // Clear workflow executing state when done
        isWorkflowExecutingRef.current = false;
        setIsWorkflowExecuting(false);
      }
    },
    [activeProjectId, resolvedChatId, wrappedShowFeedback, sendMessage, isWorkflowActive, clearSuggestedFollowUps]
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
    if (!resolvedChatId) return;
    const updates: Partial<ChatMeta> = { workflowId, updatedAt: Date.now() };
    if (workflowStateKey !== undefined) {
      updates.workflowStateKey = workflowStateKey;
    }
    await projectChatsUpdateChatMeta(resolvedChatId, updates);
  }, [resolvedChatId, projectChatsUpdateChatMeta]);

  const wrappedExecuteCommand = useCallback(
    async (flowId: string) => {
      const flow = flows.find((f) => f.id === flowId);
      if (!flow?.command) return;
      if (!resolvedChatId || !activeProjectId) return;
      await runExecuteCommand(flow.command, flowId, resolvedChatId, activeProjectId, wrappedShowFeedback);
    },
    [flows, resolvedChatId, activeProjectId, wrappedShowFeedback]
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
      if (!activeProjectId || !activeLogId) return;
      const currentLogId = activeLogId;
      const messages = chatLogsStore.getLog(activeProjectId, currentLogId);
      const msg = messages?.find(m => m.id === messageId);
      if (msg) {
        await navigator.clipboard.writeText(msg.content ?? "");
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
      await projectChatsUpdateChatMeta(actionChatId, { draft: rollbackMessage.content ?? "" });
    }
  }, [chats, activeProjectId, activeLogId, projectChatsUpdateChatMeta]);

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
      selectedChatId: resolvedChatId,
      setSelectedChatId,
      activeAgentId,
      activeModel,
      onAgentChange,
      onModelChange,
      activeReasoningEffort,
      onReasoningEffortChange,
      enabledToolNames,
      onToolSetChange,
      effectiveAgent,
      effectiveToolNames,
      isMainLog,
      isWorkflowExecuting,
      suggestedFollowUps,
      clearSuggestedFollowUps,
      insertSuggestion,
    }),
    [chats, messages, isLoading, isLoadingHistoryMessages, historyMessages, loadHistoryMessages, getIsProcessing, wrappedCreateChat, wrappedDeleteChat, wrappedRenameChat, loadChatMessages, refreshChats, wrappedSendMessage, stopGeneration, onUserMessageAction, resolvedChatId, setSelectedChatId, wrappedSetWorkflowId, setSelectedChatWorkflowId, workflowOnActionButtonClick, wrappedExecuteCommand, activeAgentId, activeModel, onAgentChange, onModelChange, activeReasoningEffort, onReasoningEffortChange, enabledToolNames, onToolSetChange, effectiveAgent, effectiveToolNames, isMainLog, isWorkflowExecuting, projectChatsUpdateChatMeta, workflowExecuteAdjustPrompt, suggestedFollowUps, clearSuggestedFollowUps, insertSuggestion]
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
