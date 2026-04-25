export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface LLMConfig {
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  stream: boolean;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
}

export interface ChatCompletionChoice {
  index: number;
  delta: ChatCompletionDelta;
  finishReason: string | null;
}

export interface ChatCompletionDelta {
  role?: string;
  content?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export type MessageRole = ChatMessage['role'];
export type StreamHandler = (chunk: string, done: boolean) => void;
