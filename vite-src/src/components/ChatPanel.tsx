import { useRef, useEffect, useCallback, useMemo, useState, memo } from "react";
import React from "react";
import { Send, StopCircle, GitBranch, X, ArrowRightLeft, Play, Brain, Copy, Undo2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType, LLMStats, Flow, ToolDefinition } from "../types/chat";
import { useContextWindow } from "../hooks/useContextWindow";
import { useSelectionBubble } from "../hooks/useSelectionBubble";
import { useSettings, useAgentsContext, useChats, useProjects, useNav, useFlowsContext, useEventBus } from "../contexts";
import { chatStore } from "../store/chats";
import { isBackendConnected } from "../utils/platformUtils";
import ModelPicker from "./ModelPicker";
import AgentPicker from "./AgentPicker";
import ThinkingPicker from "./ThinkingPicker";
import ContextRing from "./ContextRing";
import LogSelector from "./LogSelector";
import FileSelector from "./FileSelector";
import SelectionBubble from "./SelectionBubble";
import FeedbackPopup from "./FeedbackPopup";
import ToastPopup from "./ToastPopup";
import { getDisplayName } from "../utils/modelUtils";
import { getAvailableTools } from "../tools";
import ToolCallSection from "./ToolCallSection";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  isProcessing: boolean;
  onSend: (content: string, modelId: string) => Promise<void>;
  onStop: () => void;
  onFileSelect?: (uniqueName: string) => void;
  tempFileOptions?: Array<{ baseName: string; uniqueName: string }>;
  activeTempFileUniqueName?: string | null;
}

function formatTokensPerSecond(completionTokens: number, timeMs: number): string {
  const seconds = timeMs / 1000;
  if (seconds <= 0) return "—";
  const tps = (completionTokens / seconds).toFixed(1);
  return `${tps} tok/s`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function MessageStats({ stats, modelAliases }: { stats: LLMStats; modelAliases: Record<string, string> }) {
  const seconds = stats.timeMs / 1000;
  const displayTps = formatTokensPerSecond(stats.completionTokens, stats.timeMs);

  const hasTimings = stats.predictedN != null || stats.predictedMs != null;
  const formatMs = (ms?: number): string => {
    if (ms == null) return "—";
    if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
    return `${ms.toFixed(1)}ms`;
  };
  const formatRate = (rate?: number): string => {
    if (rate == null) return "—";
    return `${rate.toFixed(1)} tok/s`;
  };

  return (
    <div className={styles.bubbleStats}>
      <span className={styles.duration}>{formatDuration(stats.timeMs)}</span>
      <span className={styles.tps}>{displayTps}</span>
      <span className={styles.model}>{getDisplayName(stats.model, modelAliases)}</span>
      {hasTimings && (
        <div className={styles.bubbleStatsTooltip}>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Prompt</span>
            <span className={styles.tooltipValue}>{stats.promptTokens.toLocaleString()} tokens</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Completion</span>
            <span className={styles.tooltipValue}>{stats.completionTokens.toLocaleString()} tokens</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Total</span>
            <span className={styles.tooltipValue}>{stats.totalTokens.toLocaleString()} tokens</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Time</span>
            <span className={styles.tooltipValue}>{seconds >= 1 ? `${seconds.toFixed(1)}s` : `${stats.timeMs}ms`}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Predicted</span>
            <span className={styles.tooltipValue}>{stats.predictedN} tokens ({formatMs(stats.predictedMs)})</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Predicted Rate</span>
            <span className={styles.tooltipValue}>{formatRate(stats.predictedPerSecond)}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Predicted/token</span>
            <span className={styles.tooltipValue}>{formatMs(stats.predictedPerTokenMs)}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Prompt Time</span>
            <span className={styles.tooltipValue}>{formatMs(stats.promptMs)}</span>
          </div>
          <div className={styles.tooltipRow}>
            <span className={styles.tooltipLabel}>Prompt Rate</span>
            <span className={styles.tooltipValue}>{formatRate(stats.promptPerSecond)}</span>
          </div>
          {stats.cacheN != null && (
            <div className={styles.tooltipRow}>
              <span className={styles.tooltipLabel}>Cache Hit</span>
              <span className={styles.tooltipValue}>{stats.cacheN} tokens from cache</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function WorkflowSelector({ workflows, onSelect, selectedWorkflowId }: { workflows: Flow[]; onSelect: (id: string) => void; selectedWorkflowId?: string }) {
  if (workflows.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No workflows available. Add <code>.yaml</code> files to a workflows folder.</p>
      </div>
    );
  }

  return (
    <div className={styles.workflowSelector}>
      <p className={styles.workflowSelectorTitle}>Select a workflow to get started</p>
      <div className={styles.workflowGrid}>
        {workflows.map((flow) => {
          const isCommand = (flow as any).isCommand;
          return (
            <button
              key={flow.id}
              className={`${styles.workflowCard} ${selectedWorkflowId === flow.id ? styles.workflowCardSelected : ""}`}
              onClick={() => onSelect(flow.id)}
              type="button"
            >
              <div className={styles.workflowCardHeader}>
                {isCommand ? <Play size={16} /> : <GitBranch size={16} />}
                <span className={styles.workflowCardName}>{flow.name}</span>
              </div>
              {flow.description && (
                <p className={styles.workflowCardDescription}>{flow.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const MessageBubble = memo(function MessageBubble({ message, modelAliases, toolResultMessages, chatId, onUserMessageAction }: { message: ChatMessageType; modelAliases: Record<string, string>; toolResultMessages?: ChatMessageType[]; chatId?: string; onUserMessageAction?: (params: { chatId: string; messageId: string; action: 'copy' | 'rollback' }) => Promise<void> }) {
  const isUser = message.role === "user";
  const hasStats = message.role !== "user" && message.stats;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasAdjusted = isUser && message.originalContent && message.originalContent !== message.content;
  const hasReasoning = message.role === "assistant" && message.reasoningContent && message.reasoningContent.trim();

  const [showAdjusted, setShowAdjusted] = useState(false);

  const toolCallResults = useMemo(() => {
    if (!toolResultMessages) return {};
    const results: Record<string, string> = {};
    for (const tr of toolResultMessages) {
      if (tr.role === "tool" && tr.toolCallId) {
        results[tr.toolCallId] = tr.content;
      }
    }
    return results;
  }, [toolResultMessages]);

  const displayContent = hasAdjusted ? (showAdjusted ? message.content : message.originalContent) : message.content;
  const showContent = displayContent?.trim();

  if (hasAdjusted) {
    return (
      <div className={`${styles.message} ${styles.messageWithAdjusted} ${isUser ? styles.user : styles.assistant}`}>
        <div className={styles.bubbleWrapper}>
          <div className={`${styles.bubble} ${!showContent ? styles.noContent : ""}`}>
            <div className={styles.adjustedToggle}>
              <button
                className={styles.toggleBtn}
                onClick={() => setShowAdjusted((p) => !p)}
                title={showAdjusted ? "Show modified" : "Show original"}
              >
                <ArrowRightLeft size={12} />
              </button>
            </div>
            {showContent && (
              <div className={styles.content}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
              </div>
            )}
            {hasStats && <MessageStats stats={message.stats!} modelAliases={modelAliases} />}
          </div>
        </div>
        {isUser && chatId && onUserMessageAction && (
          <div className={styles.messageUserActions}>
            <button
              className={styles.userActionButton}
              onClick={() => onUserMessageAction({ chatId, messageId: message.id, action: 'copy' })}
              title="Copy message"
            >
              <Copy size={12} />
            </button>
            <button
              className={styles.userActionButton}
              onClick={() => onUserMessageAction({ chatId, messageId: message.id, action: 'rollback' })}
              title="Roll back to here"
            >
              <Undo2 size={12} />
            </button>
          </div>
        )}
        {hasToolCalls && (
          <div className={styles.toolCallContainer}>
            {message.toolCalls!.map((tc) => (
              <ToolCallSection key={tc.id} toolCall={tc} result={toolCallResults[tc.id]} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      {hasReasoning && (
        <div className={`${styles.message} ${styles.reasoningSection} ${styles.content}`}>
          <details>
            <summary>
              <Brain size={12} />
              Reasoning
            </summary>
            <div className={styles.reasoningContent}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.reasoningContent}</ReactMarkdown>
            </div>
          </details>
        </div>
      )}
      <div className={styles.bubbleWrapper}>
        <div className={`${styles.bubble} ${!showContent ? styles.noContent : ""}`}>
          {showContent && (
            <div className={styles.content}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          )}
          {hasStats && <MessageStats stats={message.stats!} modelAliases={modelAliases} />}
        </div>
      </div>
      {isUser && chatId && onUserMessageAction && (
        <div className={styles.messageUserActions}>
          <button
            className={styles.userActionButton}
            onClick={() => onUserMessageAction({ chatId, messageId: message.id, action: 'copy' })}
            title="Copy message"
          >
            <Copy size={12} />
          </button>
          <button
            className={styles.userActionButton}
            onClick={() => onUserMessageAction({ chatId, messageId: message.id, action: 'rollback' })}
            title="Roll back to here"
          >
            <Undo2 size={12} />
          </button>
        </div>
      )}
      {hasToolCalls && (
        <div className={styles.toolCallContainer}>
          {message.toolCalls!.map((tc) => (
            <ToolCallSection key={tc.id} toolCall={tc} result={toolCallResults[tc.id]} />
          ))}
        </div>
      )}
    </div>
  );
});

const MessageList = memo(function MessageList({ messages, modelAliases, selectedChatId, onUserMessageAction }: { messages: ChatMessageType[]; modelAliases: Record<string, string>; selectedChatId: string | null; onUserMessageAction?: (params: { chatId: string; messageId: string; action: 'copy' | 'rollback' }) => Promise<void> }) {
  const elements: React.ReactElement[] = [];
  const skip: Set<number> = new Set();

  for (let i = 0; i < messages.length; i++) {
    if (skip.has(i)) continue;

    const msg = messages[i];

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      const toolResultMessages: ChatMessageType[] = [];
      for (let j = i + 1; j < messages.length; j++) {
        if (skip.has(j)) break;
        const next = messages[j];
        if (next.role === "tool" && next.toolCallId) {
          if (msg.toolCalls!.some((tc) => tc.id === next.toolCallId)) {
            toolResultMessages.push(next);
            skip.add(j);
          } else {
            break;
          }
        } else {
          break;
        }
      }
      elements.push(
        <div key={msg.id}>
          <MessageBubble message={msg} modelAliases={modelAliases} toolResultMessages={toolResultMessages} chatId={selectedChatId ?? undefined} onUserMessageAction={onUserMessageAction} />
        </div>
      );
      continue;
    }

    elements.push(
      <div key={msg.id}>
        <MessageBubble message={msg} modelAliases={modelAliases} chatId={selectedChatId ?? undefined} onUserMessageAction={onUserMessageAction} />
      </div>
    );
  }

  return elements;
});

export default function ChatPanel({
  messages,
  isLoading,
  isProcessing,
  onSend,
  onStop,
  onFileSelect,
  activeTempFileUniqueName: activeFileUniqueName
}: ChatPanelProps) {
  const { visibleModels, settings } = useSettings();
  const { mainAgents, allAgents } = useAgentsContext();
  const { projects } = useProjects();
  const { activeProjectId, logId, navigateToLog } = useNav();
  const { 
    chats,
    selectedChatId,
    activeAgentId,
    activeModel,
    onActionButtonClick,
    executeCommand: runCommand,
    setSelectedChatWorkflowId,
    onUserMessageAction,
  } = useChats();

  const [extensionStatus, setExtensionStatus] = useState<string | null>(null);

  // Chat draft state (migrated from useChatDraft hook)
  const [draft, setDraft] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [writeProjectId, setWriteProjectId] = useState<string | undefined>();
  const [writeChatId, setWriteChatId] = useState<string | undefined>();

  // Load draft when chat changes
  useEffect(() => {
    if (!activeProjectId || !selectedChatId) {
      setDraft("");
      return;
    }

    const loadDraft = async () => {
      if (!isBackendConnected()) {
        setDraft("");
        return;
      }

      await chatStore.load(activeProjectId);
      const metas = chatStore.getChatMetas(activeProjectId);
      const chatMeta = metas.find((m) => m.id === selectedChatId);
      setDraft(chatMeta?.draft || "");
      setWriteProjectId(chatMeta?.projectId || activeProjectId);
      setWriteChatId(selectedChatId);
    };

    loadDraft();

    // Subscribe to chat metadata changes (e.g. from extensions calling won.setChatDraft())
    const unsubscribe = chatStore.subscribe(activeProjectId, () => {
      const chatMeta = chatStore.getChat(activeProjectId, selectedChatId);
      if (chatMeta) {
        setDraft(chatMeta.draft || "");
        setWriteProjectId(chatMeta.projectId || activeProjectId);
        setWriteChatId(selectedChatId);
      }
    });

    return unsubscribe;
  }, [activeProjectId, selectedChatId]);

  // Debounced save to file on interval
  useEffect(() => {
    if (!writeProjectId || !writeChatId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      chatStore.setChatDraft(writeProjectId, writeChatId, draft, true);
    }, 5000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draft, writeProjectId, writeChatId]);
  const { flows, enabledWorkflows, commandFlows, disabledFlows } = useFlowsContext();
  const { on: onEvent } = useEventBus();
  const [showCommandsPopup, setShowCommandsPopup] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const enabledCommands = useMemo(
    () => commandFlows.filter((f) => !disabledFlows.includes(f.id)),
    [commandFlows, disabledFlows]
  );
  const activeProject = projects.find((p) => p.id === activeProjectId);

  // Resolve the effective system prompt for display
  const resolvedSystemPrompt = useMemo(() => {
    const currentChat = chats.find((c) => c.id === selectedChatId);
    const agentId = currentChat?.activeAgentId || activeAgentId;
    const agent = allAgents.find((a) => a.id === agentId);
    const agentSystemPrompt = agent?.systemPrompt;
    return agentSystemPrompt || settings.systemPrompt;
  }, [allAgents, activeAgentId, selectedChatId, settings.systemPrompt]);

  const currentChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) ?? null;
  }, [chats, selectedChatId]);

  const resolvedWorkflow = flows.find((f) => f.id === currentChat?.workflowId);
  const resolvedStateMessage = resolvedWorkflow?.states?.[currentChat?.workflowStateKey ?? ""]?.message;
  const resolvedActionButtons = resolvedWorkflow?.states?.[currentChat?.workflowStateKey ?? ""]?.actionButtons;
  const chatName = currentChat?.name;

  // Build log options: main log + subagents + version history + queries
  const logOptions = useMemo(() => {
    if (!currentChat) return [];
    const options: Array<{ id: string; label: string }> = [
      { id: currentChat.logId, label: "Main" },
    ];
    const subagents = currentChat.subagents || [];
    for (let i = 0; i < subagents.length; i++) {
      const subagent = subagents[i];
      const agent = allAgents.find((a) => a.id === subagent.agentId);
      const agentName = agent?.name || "Subagent";
      options.push({
        id: subagent.logId,
        label: `${agentName} ${i + 1}`,
      });
    }
    const versionHistory = currentChat.versionHistory || [];
    for (let i = 0; i < versionHistory.length; i++) {
      const version = versionHistory[i];
      const creationTime = new Date(version.createdAt).toLocaleTimeString();
      options.push({
        id: version.logId,
        label: `Version ${i + 1} (${creationTime})`,
      });
    }
    if (currentChat.queriesLogId) {
      options.push({
        id: currentChat.queriesLogId,
        label: "Queries",
      });
    }
    return options;
  }, [currentChat, allAgents]);

  const effectiveLogId = logId || currentChat?.logId;

  // Derive subtitle when a subagent or queries log is selected
  const logSubtitle = useMemo(() => {
    if (!logId || !currentChat) return null;
    if (logId === currentChat.logId) return null;
    if (logId === currentChat.queriesLogId) return "Queries";
    const subagent = currentChat.subagents?.find((s) => s.logId === logId);
    if (!subagent) return null;
    const agent = allAgents.find((a) => a.id === subagent.agentId);
    const agentName = agent?.name || "Subagent";
    const index = (currentChat.subagents || []).findIndex((s) => s.logId === logId);
    return `${agentName} ${index + 1}`;
  }, [logId, currentChat, allAgents]);

  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);

  useEffect(() => {
    const loadTools = async () => {
      let agent = allAgents.find((a) => a.id === activeAgentId);
      const tools = await getAvailableTools(activeProject?.folderPath, agent, allAgents);
      setAvailableTools(tools);
    };
    loadTools();
  }, [activeProject?.folderPath, activeAgentId, allAgents]);
  const { maxTokens } = useContextWindow(activeModel, settings);

  const usageTokens = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.stats) {
      return 0;
    }
    const stats = lastMsg.stats;
    return (stats.promptTokens || 0) + (stats.completionTokens || 0);
  }, [messages]);

  // Build text content for tokenization
  const toolsForTokenize = useMemo((): ToolDefinition[] => {
    if (availableTools.length === 0) return [];
    return availableTools.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }, [availableTools]);

  const toolsJson = useMemo(
    () => JSON.stringify(toolsForTokenize, null, 2),
    [toolsForTokenize]
  );

  const messagesText = useMemo(
    () =>
      messages
        .map((m) => `[${m.role}]: ${m.content ?? ""}`)
        .join("\n"),
    [messages]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const { bubbleData, dismiss: dismissBubble } = useSelectionBubble(messagesContainerRef);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [draft]);

  const handleBubbleComment = useCallback((selectedText: string) => {
    if (!selectedText) {
      dismissBubble();
      return;
    }
    const normalized = selectedText.replace(/\r?\n/g, " ");
    let processed = normalized;
    if (processed.length > 200) {
      const half = Math.floor((200 - 3) / 2);
      processed = processed.slice(0, half) + "..." + processed.slice(processed.length - half);
    }
    const reText = `RE "${processed}": `;
    setDraft(draft + reText);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const cursorPos = draft.length + reText.length;
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = cursorPos;
      }
    });
    dismissBubble();
  }, [draft, setDraft, dismissBubble]);

  // Listen for RE comments from FileViewerPanel via event bus
  useEffect(() => {
    const handleReComment = (payload: unknown) => {
      const reText = payload as string;
      setDraft(draft + reText);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const cursorPos = draft.length + reText.length;
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = cursorPos;
        }
      });
    };

    return onEvent("re-comment", handleReComment);
  }, [draft, onEvent, setDraft]);

  useEffect(() => {
    const handleExtensionStatus = (payload: unknown) => {
      setExtensionStatus(payload as string ?? null);
    };
    return onEvent("setExtensionStatus", handleExtensionStatus);
  }, [onEvent]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowCommandsPopup(false);
      }
    }
    if (showCommandsPopup) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCommandsPopup]);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || isLoading) return;
      setDraft("");
      await onSend(trimmed, activeModel);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [draft, isLoading, onSend, activeModel, setDraft]
  );

  const shouldShowStopButton = isProcessing;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  return (
    <div className={styles.container}>
      <div className={styles.mainContent}>
        {chatName && (
          <div className={styles.chatHeader}>
            <span className={styles.chatHeaderName}>
              {logSubtitle ? (
                <>
                  <span
                    onClick={() => navigateToLog(currentChat!.logId)}
                    className={styles.chatHeaderNameClickable}
                  >
                    {chatName}
                  </span>
                  <span className={styles.headerSeparator}>{" > "}</span>
                  <span className={styles.headerSubtitle}>{logSubtitle}</span>
                </>
              ) : (
                chatName
              )}
            </span>
            <div className={styles.chatHeaderDropdowns}>
              <LogSelector
                logs={logOptions}
                activeLogId={effectiveLogId || currentChat?.logId || ""}
                onLogChange={navigateToLog}
              />
              {onFileSelect && (
                <FileSelector
                  files={currentChat?.reservedTempFiles || []}
                  activeFileUniqueName={activeFileUniqueName || null}
                  onFileSelect={onFileSelect}
                />
              )}
            </div>
          </div>
        )}
        
        <details className={styles.systemPromptCollapse}>
          <summary className={styles.systemPromptSummary}>system prompt</summary>
          <pre className={styles.systemPromptContent}>{resolvedSystemPrompt}</pre>
        </details>
        {availableTools.length > 0 && (
          <details className={styles.systemPromptCollapse}>
            <summary className={styles.systemPromptSummary}>tools</summary>
            <div className={styles.toolsGrid}>
              {availableTools.map((tool) => (
                <div key={tool.function.name} className={styles.toolCard}>
                  <div className={styles.toolCardName}>{tool.function.name}</div>
                  <div className={styles.toolCardDesc} title={tool.function.description}>{tool.function.description}</div>
                </div>
              ))}
            </div>
          </details>
        )}
        <div className={styles.messages} ref={messagesContainerRef}>
          {messages.length === 0 && (
            <WorkflowSelector
              workflows={enabledWorkflows.filter((f) => !(f as any).isCommand)}
              onSelect={(id) => {
                const flow = enabledWorkflows.find((f) => f.id === id);
                setSelectedChatWorkflowId(id, flow?.initialState);
              }}
              selectedWorkflowId={(resolvedWorkflow?.id)}
            />
          )}
         <MessageList messages={messages} modelAliases={settings.modelAliases} selectedChatId={selectedChatId} onUserMessageAction={onUserMessageAction} />
            {isProcessing && (
              <div className={styles.thinkingIndicator}>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
              </div>
            )}
            <div ref={messagesEndRef} />
           {bubbleData && (
             <SelectionBubble
               position={bubbleData}
               selectedText={bubbleData.text}
               onComment={handleBubbleComment}
             />
           )}
        </div>
       </div>

       <FeedbackPopup />
        <ToastPopup />

       {extensionStatus && (
         <div className={styles.extensionStatusBar}>
           <div className={styles.extensionStatusInner}>
             <span className={styles.extensionStatusText}>{extensionStatus}</span>
             <button
               className={styles.workflowStateMessageRemove}
               onClick={() => setExtensionStatus(null)}
               type="button"
               title="Dismiss status"
             >
               <X size={14} />
             </button>
           </div>
         </div>
       )}

       {resolvedStateMessage && (
        <div className={styles.workflowStateMessageBar}>
          <div className={styles.workflowStateMessageInner}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resolvedStateMessage}</ReactMarkdown>
            <div className={styles.workflowStateActionButtons}>
              {resolvedActionButtons?.map((btn) => (
                <button
                  key={`action-${btn.idx}`}
                  className={styles.workflowStateActionButton}
                  onClick={() => onActionButtonClick(btn, logId ?? undefined)}
                  type="button"
                >
                  {btn.label}
                </button>
              ))}
              {resolvedWorkflow && (
                <button
                  className={styles.workflowStateMessageRemove}
                  onClick={() => setSelectedChatWorkflowId(undefined, undefined)}
                  type="button"
                  title="Remove workflow"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (writeProjectId && writeChatId) {
                chatStore.setChatDraft(writeProjectId, writeChatId, draft, true);
              }
            }}
            placeholder="Type a message..."
            rows={1}
          />
          {shouldShowStopButton ? (
            <button
              type="button"
              className={styles.stopButton}
              onClick={onStop}
              title="Stop generation"
            >
              <StopCircle size={18} />
            </button>
          ) : (
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!draft.trim()}
              title="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerContainer}>
          <div className={styles.footerSelectors}>
            <ModelPicker
              models={visibleModels}
              modelAliases={settings.modelAliases}
            />
            <AgentPicker
              agents={mainAgents}
            />
            <ThinkingPicker />
          </div>
          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.commandButton}
              onClick={() => setShowCommandsPopup(!showCommandsPopup)}
              title="Run command"
              disabled={enabledCommands.length === 0}
            >
              <Play size={16} />
            </button>
            {showCommandsPopup && (
              <div ref={popupRef} className={styles.commandPopupWrapper}>
                <div className={styles.commandPopup}>
                  <div className={styles.commandPopupHeader}>Commands</div>
                  {enabledCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      className={styles.commandPopupItem}
                      onClick={() => {
                        runCommand(cmd.id);
                        setShowCommandsPopup(false);
                      }}
                      type="button"
                    >
                      {cmd.name}
                    </button>
                  ))}
                  {enabledCommands.length === 0 && (
                    <div className={styles.commandPopupEmpty}>No commands available</div>
                  )}
                </div>
              </div>
            )}
            <ContextRing
              usageTokens={usageTokens}
              maxTokens={maxTokens}
              serverUrl={settings.serverUrl}
              model={activeModel}
              systemPrompt={resolvedSystemPrompt}
              toolsJson={toolsJson}
              messagesText={messagesText}
            />
        </div>
        </div>
      </div>
    </div>
  );
}
