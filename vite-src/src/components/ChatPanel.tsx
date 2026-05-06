import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Send, StopCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType, LLMStats } from "../types/chat";
import { ChatSettings } from "../hooks/useChatSettings";
import { useContextWindow } from "../hooks/useContextWindow";
import ModelPicker from "./ModelPicker";
import ContextRing from "./ContextRing";
import { getDisplayName } from "../utils/modelUtils";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSend: (content: string, modelId: string) => void;
  onStop: () => void;
  models: Array<{ id: string }>;
  activeModel: string;
  onModelChange: (modelId: string) => void;
  chatName?: string;
  settings: ChatSettings;
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

function MessageBubble({ message, modelAliases }: { message: ChatMessageType; modelAliases: Record<string, string> }) {
  const isUser = message.role === "user";
  const hasStats = message.role !== "user" && message.stats;

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.bubbleWrapper}>
        <div className={styles.bubble}>
          <div className={styles.content}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
          {hasStats && <MessageStats stats={message.stats!} modelAliases={modelAliases} />}
        </div>
      </div>
    </div>
  );
}

export default function ChatPanel({
  messages,
  isLoading,
  onSend,
  onStop,
  models,
  activeModel,
  onModelChange,
  chatName,
  settings,
}: ChatPanelProps) {
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
  const [input, setInput] = useState("");
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
  }, [input]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = input.trim();
      if (!trimmed || isLoading) return;
      onSend(trimmed, activeModel);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [input, isLoading, onSend, activeModel]
  );

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
           {messages.map((msg) => (
              <div key={msg.id}>
                <MessageBubble message={msg} modelAliases={settings.modelAliases} />
              </div>
            ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
          />
          {isLoading ? (
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
              disabled={!input.trim()}
              title="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerContainer}>
        <ModelPicker
             models={models}
             activeModel={activeModel}
             onModelChange={onModelChange}
             modelAliases={settings.modelAliases}
           />
          {showRing && (
            <ContextRing
              usageTokens={usageTokens}
              maxTokens={maxTokens}
            />
          )}
        </div>
      </div>
    </div>
  );
}
