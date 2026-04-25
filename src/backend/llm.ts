import dotenv from 'dotenv';
import { LLMConfig, StreamHandler, ChatMessage, ChatCompletionChunk } from './types.js';

dotenv.config();

class LLMService {
  private config: LLMConfig;

  constructor() {
    this.config = {
      baseUrl: process.env.LLM_BASE_URL || 'http://localhost:8080',
      model: process.env.LLM_MODEL || 'qwen3:latest',
      maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '2048', 10),
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.7'),
      stream: process.env.LLM_STREAM !== 'false',
    };
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<LLMConfig>): LLMConfig {
    this.config = { ...this.config, ...newConfig };
    return this.getConfig();
  }

  async chat(
    messages: ChatMessage[],
    onChunk: StreamHandler,
  ): Promise<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;

    const body = {
      model: this.config.model,
      messages,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      stream: this.config.stream,
    };

    if (this.config.stream) {
      return this.streamChat(url, body, onChunk);
    }

    return this.nonStreamChat(url, body, onChunk);
  }

  private async streamChat(
    url: string,
    body: unknown,
    onChunk: StreamHandler,
  ): Promise<string> {
    let fullContent = '';
    let responseId = '';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body has no reader');
    }

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n').filter((l) => l.trim().startsWith('data: '));

      for (const line of lines) {
        const data = line.slice(6).trim();
        if (data === '[DONE]') {
          onChunk('', true);
          continue;
        }

        try {
          const chunk: ChatCompletionChunk = JSON.parse(data);
          if (!responseId) responseId = chunk.id;

          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            fullContent += content;
            onChunk(content, false);
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    return fullContent;
  }

  private async nonStreamChat(
    url: string,
    body: unknown,
    onChunk: StreamHandler,
  ): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`LLM API error (${response.status}): ${error}`);
    }

    const data: unknown = await response.json();
    const choices = (data as { choices?: { message?: { content?: string } }[] }).choices;
    const content = choices?.[0]?.message?.content ?? '';

    onChunk(content, true);
    return content;
  }
}

export const llmService = new LLMService();
