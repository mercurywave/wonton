import { useState, useRef, useEffect, useCallback } from "react";
import { Send, StopCircle } from "lucide-react";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType } from "../types/chat";
import ModelPicker from "./ModelPicker";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  onSend: (content: string, modelId: string) => void;
  onStop: () => void;
  models: Array<{ id: string }>;
  activeModel: string;
  onModelChange: (modelId: string) => void;
}

function MessageBubble({ message }: { message: ChatMessageType }) {
  const isUser = message.role === "user";

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.bubble}>
        <div className={styles.content}>{message.content}</div>
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
}: ChatPanelProps) {
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
        <div className={styles.messages}>
          {messages.length === 0 && (
            <div className={styles.empty}>
              <p>Start a conversation by typing a message below.</p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {isLoading && (
            <div className={`${styles.message} ${styles.assistant}`}>
              <div className={styles.bubble}>
                <div className={styles.typing}>
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          )}
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
        <ModelPicker
          models={models}
          activeModel={activeModel}
          onModelChange={onModelChange}
        />
      </div>
    </div>
  );
}
