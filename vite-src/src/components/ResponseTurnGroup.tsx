import React, { useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Brain, Copy, Undo2, ArrowRightLeft } from "lucide-react";
import type { ChatMessage, LLMStats, ResponseTurnGroup as ResponseTurnGroupType } from "../types/chat";
import ToolCallSection from "./ToolCallSection";
import CollapsedSection from "./CollapsedSection";
import styles from "./ResponseTurnGroup.module.css";

interface MessageStatsProps {
  stats: LLMStats;
  modelAliases: Record<string, string>;
}

function MessageStats({ stats, modelAliases }: MessageStatsProps) {
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

function getDisplayName(model: string, aliases: Record<string, string>): string {
  return aliases[model] || model;
}

interface MessageBubbleProps {
  message: ChatMessage;
  modelAliases: Record<string, string>;
  toolResultMessages?: ChatMessage[];
}

function MessageBubble({ message, modelAliases, toolResultMessages }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const hasStats = message.role !== "user" && message.stats;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;
  const hasAdjusted = isUser && message.originalContent && message.originalContent !== message.content;
  const hasReasoning = message.role === "assistant" && message.reasoningContent && message.reasoningContent.trim();

  const [showAdjusted, setShowAdjusted] = useState(false);

  const toolCallResults = useMemo(() => {
    if (!toolResultMessages) return {};
    const results: Record<string, { content: string; toolExecutionMs?: number }> = {};
    for (const tr of toolResultMessages) {
      if (tr.role === "tool" && tr.toolCallId) {
        results[tr.toolCallId] = { content: tr.content ?? "", toolExecutionMs: tr.toolExecutionMs };
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
              <ToolCallSection key={tc.id} toolCall={tc} result={toolCallResults[tc.id]?.content} toolExecutionMs={toolCallResults[tc.id]?.toolExecutionMs} />
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
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
            </div>
          )}
          {hasStats && <MessageStats stats={message.stats!} modelAliases={modelAliases} />}
        </div>
      </div>
      {hasToolCalls && (
        <div className={styles.toolCallContainer}>
          {message.toolCalls!.map((tc) => (
            <ToolCallSection key={tc.id} toolCall={tc} result={toolCallResults[tc.id]?.content} toolExecutionMs={toolCallResults[tc.id]?.toolExecutionMs} />
          ))}
        </div>
      )}
    </div>
  );
}

interface ResponseTurnGroupProps {
  turnGroup: ResponseTurnGroupType;
  modelAliases: Record<string, string>;
  selectedChatId: string | null;
  onUserMessageAction?: (params: { chatId: string; messageId: string; action: "copy" | "rollback" }) => Promise<void>;
  isStreaming: boolean;
  isLastVisible: boolean;
}

export default function ResponseTurnGroup({ turnGroup, modelAliases, selectedChatId, onUserMessageAction, isStreaming, isLastVisible: _isLastVisible }: ResponseTurnGroupProps) {
  const { userMessage, intermediateMessages, finalAssistantMessage, isCompleted } = turnGroup;

  // During streaming, show intermediate messages for the active turn
  // For completed turns, collapse the intermediate messages
  const showIntermediate = isStreaming && !isCompleted;
  
  // Count tool call actions in intermediate messages for summary
  const toolCallCount = intermediateMessages.filter(m => m.toolCalls && m.toolCalls.length > 0).length;
  const toolResultCount = intermediateMessages.filter(m => m.role === "tool").length;
  const reasoningCount = intermediateMessages.filter(m => m.reasoningContent && m.reasoningContent.trim()).length;
  const hasAssistantIntermediate = intermediateMessages.some(m => m.role === "assistant");
  
  const totalIntermediateCount = toolCallCount + toolResultCount + reasoningCount + (hasAssistantIntermediate ? 1 : 0);
  const labelParts: string[] = [];
  if (toolCallCount > 0) labelParts.push(`${toolCallCount} tool${toolCallCount > 1 ? 's' : ''}`);
  if (toolResultCount > 0) labelParts.push(`${toolResultCount} result${toolResultCount > 1 ? 's' : ''}`);
  if (reasoningCount > 0) labelParts.push(`${reasoningCount} reasoning`);
  if (hasAssistantIntermediate) labelParts.push(`${intermediateMessages.filter(m => m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0).length} round${intermediateMessages.filter(m => m.role === "assistant" && m.toolCalls && m.toolCalls.length > 0).length > 1 ? 's' : ''}`);

  // Render intermediate messages (collapsed by default for completed turns)
  const renderIntermediate = () => {
    if (intermediateMessages.length === 0) return null;

    // Group assistant messages with their tool calls and tool results
    const rendered: React.ReactNode[] = [];
    let i = 0;

    while (i < intermediateMessages.length) {
      const msg = intermediateMessages[i];

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        // Collect tool results for this assistant's tool calls
        const toolResultMessages: ChatMessage[] = [];
        let j = i + 1;
        while (j < intermediateMessages.length) {
          const next = intermediateMessages[j];
          if (next.role === "tool" && next.toolCallId && msg.toolCalls!.some((tc) => tc.id === next.toolCallId)) {
            toolResultMessages.push(next);
            j++;
          } else {
            break;
          }
        }
        rendered.push(
          <div key={msg.id}>
            <MessageBubble message={msg} modelAliases={modelAliases} toolResultMessages={toolResultMessages} />
          </div>
        );
        i = j;
        continue;
      }

      rendered.push(
        <div key={msg.id}>
          <MessageBubble message={msg} modelAliases={modelAliases} />
        </div>
      );
      i++;
    }

    return rendered;
  };

  return (
    <div className={styles.turnGroup}>
      {/* User message */}
      <div className={`${styles.message} ${styles.user}`}>
        <MessageBubble message={userMessage} modelAliases={modelAliases} />
        {selectedChatId && onUserMessageAction && (
          <div className={styles.messageUserActions}>
            <button
              className={styles.userActionButton}
              onClick={() => onUserMessageAction({ chatId: selectedChatId, messageId: userMessage.id, action: "copy" })}
              title="Copy message"
            >
              <Copy size={12} />
            </button>
            <button
              className={styles.userActionButton}
              onClick={() => onUserMessageAction({ chatId: selectedChatId, messageId: userMessage.id, action: "rollback" })}
              title="Roll back to here"
            >
              <Undo2 size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Intermediate messages (collapsed or streamed) */}
      {intermediateMessages.length > 0 && (
        <div className={styles.intermediateSection}>
          {showIntermediate ? (
            // Streaming: show all intermediate messages
            renderIntermediate()
          ) : (
            // Completed: show collapsed section
            <CollapsedSection count={totalIntermediateCount} label={isCompleted ? "tool events" : "events"}>
              {renderIntermediate()}
            </CollapsedSection>
          )}
        </div>
      )}

      {/* Final assistant response */}
      {finalAssistantMessage.id !== userMessage.id && (
        <div className={`${styles.message} ${styles.assistant}`}>
          <MessageBubble message={finalAssistantMessage} modelAliases={modelAliases} />
        </div>
      )}
    </div>
  );
}
