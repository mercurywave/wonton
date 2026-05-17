import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { Send, StopCircle, Hammer } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType, LLMStats, ToolCall } from "../types/chat";
import { useContextWindow } from "../hooks/useContextWindow";
import { useChatDraft } from "../hooks/useChatDraft";
import { useSettings, useAgentsContext, useChats, useProjects } from "../contexts";
import ModelPicker from "./ModelPicker";
import AgentPicker from "./AgentPicker";
import ContextRing from "./ContextRing";
import ToolPicker from "./ToolPicker";
import { getDisplayName } from "../utils/modelUtils";
import { getAvailableTools } from "../tools";
import ToolCallSection from "./ToolCallSection";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  isProcessing: boolean;
  onSend: (content: string, modelId: string) => void;
  onStop: () => void;
  activeModel: string;
  onModelChange: (modelId: string) => void;
  activeAgentId: string;
  onAgentChange: (agentId: string) => void;
  chatName?: string;
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

function MessageBubble({ message, modelAliases, toolResultMessages }: { message: ChatMessageType; modelAliases: Record<string, string>; toolResultMessages?: ChatMessageType[] }) {
  const isUser = message.role === "user";
  const hasStats = message.role !== "user" && message.stats;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

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

  const showContent = message.content?.trim();

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
}: ChatPanelProps) {
  const { visibleModels, settings } = useSettings();
  const { mainAgents } = useAgentsContext();
  const { setChatDraft, activeChatId } = useChats();
  const { activeProject, activeProjectId } = useProjects();

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
  const { draft, setDraft, handleBlur } = useChatDraft(activeProjectId, activeChatId || undefined, setChatDraft);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [draft]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || isLoading) return;
      onSend(trimmed, activeModel);
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
            <span className={styles.chatHeaderName}>{chatName}</span>
          </div>
        )}
        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.empty}>
              <p>Start a conversation by typing a message below.</p>
            </div>
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
        </div>
      </div>

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
