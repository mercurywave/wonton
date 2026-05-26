import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Send, StopCircle, GitBranch, X, ArrowRightLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType, LLMStats, Flow } from "../types/chat";
import { useContextWindow } from "../hooks/useContextWindow";
import { useChatDraft } from "../hooks/useChatDraft";
import { useSelectionBubble } from "../hooks/useSelectionBubble";
import { useSettings, useAgentsContext, useChats, useProjects, useNav, useFlowsContext, useEventBus } from "../contexts";
import ModelPicker from "./ModelPicker";
import AgentPicker from "./AgentPicker";
import ContextRing from "./ContextRing";
import ToolPicker from "./ToolPicker";
import LogSelector from "./LogSelector";
import FileSelector from "./FileSelector";
import SelectionBubble from "./SelectionBubble";
import { getDisplayName } from "../utils/modelUtils";
import { getAvailableTools } from "../tools";
import ToolCallSection from "./ToolCallSection";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  isProcessing: boolean;
  onSend: (content: string, modelId: string) => Promise<void>;
  onStop: () => void;
  activeModel: string;
  onModelChange: (modelId: string) => void;
  activeAgentId: string;
  onAgentChange: (agentId: string) => void;
  chatName?: string;
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
        <p>No workflows available. Add <code>.yaml</code> files to your project's flows folder.</p>
      </div>
    );
  }

  return (
    <div className={styles.workflowSelector}>
      <p className={styles.workflowSelectorTitle}>Select a workflow to get started</p>
      <div className={styles.workflowGrid}>
        {workflows.map((flow) => (
          <button
            key={flow.id}
            className={`${styles.workflowCard} ${selectedWorkflowId === flow.id ? styles.workflowCardSelected : ""}`}
            onClick={() => onSelect(flow.id)}
            type="button"
          >
            <div className={styles.workflowCardHeader}>
              <GitBranch size={16} />
              <span className={styles.workflowCardName}>{flow.name}</span>
            </div>
            {flow.description && (
              <p className={styles.workflowCardDescription}>{flow.description}</p>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, modelAliases, toolResultMessages }: { message: ChatMessageType; modelAliases: Record<string, string>; toolResultMessages?: ChatMessageType[] }) {
  const isUser = message.role === "user";
  const hasStats = message.role !== "user" && message.stats;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasAdjusted = isUser && message.originalContent && message.originalContent !== message.content;

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

export default function ChatPanel({
  messages,
  isLoading,
  isProcessing,
  onSend,
  onStop,
  activeModel,
  onModelChange,
  activeAgentId,
  onAgentChange,
  chatName,
  onFileSelect,
  activeTempFileUniqueName: activeFileUniqueName
}: ChatPanelProps) {
  const { visibleModels, settings } = useSettings();
  const { mainAgents, allAgents } = useAgentsContext();
  const { setChatDraft, setSelectedChatWorkflowId } = useChats();
  const { projects } = useProjects();
  const { activeProjectId, logId, navigateToLog } = useNav();
  const { chats, selectedChatId, onActionButtonClick } = useChats();
  const { flows, enabledWorkflows } = useFlowsContext();
  const { on: onEvent } = useEventBus();
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

  // Build log options: main log + subagents
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
    return options;
  }, [currentChat, allAgents]);

 

  const effectiveLogId = logId || currentChat?.logId;

  // Derive subtitle when a subagent log is selected
  const logSubtitle = useMemo(() => {
    if (!logId || !currentChat) return null;
    if (logId === currentChat.logId) return null;
    const subagent = currentChat.subagents?.find((s) => s.logId === logId);
    if (!subagent) return null;
    const agent = allAgents.find((a) => a.id === subagent.agentId);
    const agentName = agent?.name || "Subagent";
    const index = (currentChat.subagents || []).findIndex((s) => s.logId === logId);
    return `${agentName} ${index + 1}`;
  }, [logId, currentChat, allAgents]);

  const availableTools = useMemo(
    () => getAvailableTools(activeProject?.folderPath),
    [activeProject?.folderPath]
  );
  const { maxTokens } = useContextWindow(activeModel, settings);

  const { usageTokens, showRing } = useMemo(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant" || !lastMsg.stats) {
      return { usageTokens: 0, showRing: false };
    }
    const stats = lastMsg.stats;
    const usage = (stats.promptTokens || 0) + (stats.completionTokens || 0);
    return { usageTokens: usage, showRing: true };
  }, [messages]);
  const { draft, setDraft, handleBlur } = useChatDraft(activeProjectId || undefined, selectedChatId || undefined, setChatDraft);
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

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || isLoading) return;
      await onSend(trimmed, activeModel);
      setDraft("");
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
        )}
        
        <details className={styles.systemPromptCollapse}>
          <summary className={styles.systemPromptSummary}>system prompt</summary>
          <pre className={styles.systemPromptContent}>{resolvedSystemPrompt}</pre>
        </details>
        <div className={styles.messages} ref={messagesContainerRef}>
          {messages.length === 0 && (
            <WorkflowSelector
              workflows={enabledWorkflows}
              onSelect={(id) => {
                const flow = enabledWorkflows.find((f) => f.id === id);
                setSelectedChatWorkflowId(id, flow?.initialState);
              }}
              selectedWorkflowId={(resolvedWorkflow?.id)}
            />
          )}
          {(() => {
             const skip: Set<number> = new Set();
             const elements: React.ReactElement[] = [];

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
                     <MessageBubble message={msg} modelAliases={settings.modelAliases} toolResultMessages={toolResultMessages} />
                   </div>
                 );
                 continue;
               }

               elements.push(
                 <div key={msg.id}>
                   <MessageBubble message={msg} modelAliases={settings.modelAliases} />
                 </div>
               );
             }

             return elements;
           })()}
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

      {resolvedStateMessage && (
        <div className={styles.workflowStateMessageBar}>
          <div className={styles.workflowStateMessageInner}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resolvedStateMessage}</ReactMarkdown>
            <div className={styles.workflowStateActionButtons}>
              {resolvedActionButtons?.map((btn) => (
                <button
                  key={`action-${btn.idx}`}
                  className={styles.workflowStateActionButton}
                  onClick={() => onActionButtonClick(btn)}
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
            onBlur={handleBlur}
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
              activeModel={activeModel}
              onModelChange={onModelChange}
              modelAliases={settings.modelAliases}
            />
            <AgentPicker
              agents={mainAgents}
              activeAgentId={activeAgentId}
              onAgentChange={onAgentChange}
            />
          </div>
          <div className={styles.footerRight}>
            <ToolPicker tools={availableTools} />
            {showRing && (
              <ContextRing
                usageTokens={usageTokens}
                maxTokens={maxTokens}
              />
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
