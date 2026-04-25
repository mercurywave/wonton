import { ChatMessage, LLMConfig } from '../../backend/types';

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  config: LLMConfig;
}

type Listener = (state: ChatState) => void;

class ChatStore {
  private state: ChatState = {
    messages: [],
    isLoading: false,
    error: null,
    config: {
      baseUrl: 'http://localhost:8080',
      model: 'qwen3:latest',
      maxTokens: 2048,
      temperature: 0.7,
      stream: true,
    },
  };

  private listeners: Set<Listener> = new Set();

  get snapshot(): ChatState {
    return { ...this.state, messages: [...this.state.messages] };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snapshot = this.snapshot;
    this.listeners.forEach((fn) => fn(snapshot));
  }

  setConfig(config: LLMConfig): void {
    this.state = { ...this.state, config };
    this.notify();
  }

  addMessage(message: ChatMessage): void {
    this.state = {
      ...this.state,
      messages: [...this.state.messages, message],
    };
    this.notify();
  }

  appendToAssistant(content: string): void {
    const msgs = [...this.state.messages];
    const last = msgs[msgs.length - 1];
    if (last && last.role === 'assistant') {
      msgs[msgs.length - 1] = { ...last, content: last.content + content };
    }
    this.state = { ...this.state, messages: msgs };
    this.notify();
  }

  setStreaming(isStreaming: boolean): void {
    this.state = { ...this.state, isLoading: isStreaming };
    this.notify();
  }

  setError(error: string | null): void {
    this.state = { ...this.state, error };
    this.notify();
  }

  clearMessages(): void {
    this.state = { ...this.state, messages: [], error: null };
    this.notify();
  }

  setMessages(messages: ChatMessage[]): void {
    this.state = { ...this.state, messages };
    this.notify();
  }
}

export const chatStore = new ChatStore();
