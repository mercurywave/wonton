import { ChatMessage, LLMConfig } from '../../backend/types';

const API_BASE = 'http://localhost:3001/api';

class ApiService {
  async getConfig(): Promise<LLMConfig> {
    const res = await fetch(`${API_BASE}/config`);
    if (!res.ok) throw new Error(`Config fetch failed (${res.status})`);
    return res.json();
  }

  async updateConfig(config: Partial<LLMConfig>): Promise<LLMConfig> {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`Config update failed (${res.status})`);
    return res.json();
  }

  async sendChat(
    messages: ChatMessage[],
    onChunk: (chunk: string, done: boolean) => void,
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Chat API error (${response.status}): ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body reader');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done: readDone, value } = await reader.read();
      if (readDone) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6).trim();
        try {
          const parsed = JSON.parse(data);
          onChunk(parsed.content ?? '', parsed.done ?? false);
        } catch {
          // skip malformed
        }
      }
    }
  }
}

export const apiService = new ApiService();
