import { ChatMessage, LLMStats, ReasoningEffort, ToolDefinition } from "../types/chat";
import { ChatSettings } from "../hooks/useChatSettings";

interface SSEDelta {
  content?: string;
  reasoning_content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface SSEChunkResult {
  text: string;
  reasoningText: string;
  stats: LLMStats | null;
  toolCalls: Array<{ index: number; id: string; name: string; args: string }>;
}

export function parseSSEChunk(chunk: string): SSEChunkResult {
  let text = "";
  let reasoningText = "";
  let stats: LLMStats | null = null;
  const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();

  const lines = chunk.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const delta: SSEDelta = parsed.choices?.[0]?.delta || {};

        if (delta.content) {
          text += delta.content;
        }

        if (delta.reasoning_content) {
          reasoningText += delta.reasoning_content;
        }

        const usageData = parsed.usage;
        if (usageData) {
          stats = {
            promptTokens: usageData.prompt_tokens || 0,
            completionTokens: usageData.completion_tokens || 0,
            totalTokens: usageData.total_tokens || 0,
            model: parsed.model || "",
            timeMs: 0,
          };
        }

        const timings = parsed.timings;
        if (timings) {
          const llamacppStats: LLMStats = {
            promptTokens: timings.prompt_n || 0,
            completionTokens: timings.predicted_n || 0,
            totalTokens: (timings.prompt_n || 0) + (timings.predicted_n || 0),
            model: parsed.model || "",
            timeMs: (timings.prompt_ms || 0) + (timings.predicted_ms || 0),
            cacheN: timings.cache_n,
            promptN: timings.prompt_n,
            promptMs: timings.prompt_ms,
            promptPerTokenMs: timings.prompt_per_token_ms,
            promptPerSecond: timings.prompt_per_second,
            predictedN: timings.predicted_n,
            predictedMs: timings.predicted_ms,
            predictedPerTokenMs: timings.predicted_per_token_ms,
            predictedPerSecond: timings.predicted_per_second,
          };
          if (stats) {
            stats = { ...stats, ...llamacppStats };
          } else {
            stats = llamacppStats;
          }
        }

        const deltas = delta.tool_calls;
        if (deltas && Array.isArray(deltas)) {
          for (const deltaItem of deltas) {
            const idx = deltaItem.index || 0;
            if (!toolCallsMap.has(idx)) {
              toolCallsMap.set(idx, { id: "", name: "", args: "" });
            }
            const existing = toolCallsMap.get(idx)!;
            if (deltaItem.id) existing.id = deltaItem.id;
            if (deltaItem.function?.name) existing.name = deltaItem.function.name;
            if (deltaItem.function?.arguments) existing.args += deltaItem.function.arguments;
          }
        }
      } catch (e) {
        console.error("unexpected json response", e);
      }
    }
  }

  const toolCalls = Array.from(toolCallsMap.entries())
    .map(([index, call]) => ({ index, ...call }));

  return { text, reasoningText, stats, toolCalls };
}

export function mergeStats(existing: LLMStats | null, incoming: LLMStats | null): LLMStats | null {
  if (!existing) return incoming;
  if (!incoming) return existing;
  return { ...existing, ...incoming };
}

interface ApiMessagesResult {
  messages: Array<{
    role: string;
    content?: string;
    tool_calls?: { type: string; id: string; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }>;
  tools?: ToolDefinition[];
}

export function buildApiMessages(
  messages: ChatMessage[],
  systemPrompt?: string,
  tools?: ToolDefinition[]
): ApiMessagesResult {
  const allMessages: Array<{
    role: string;
    content?: string;
    tool_calls?: { type: string; id: string; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }> = [];

  if (systemPrompt) {
    allMessages.push({ role: "system", content: systemPrompt });
  }

  for (const msg of messages) {
    const apiMsg: {
      role: string;
      content?: string;
      tool_calls?: { type: string; id: string; function: { name: string; arguments: string } }[];
      tool_call_id?: string;
    } = { role: msg.role };

    if (msg.role === "tool") {
      apiMsg.tool_call_id = msg.toolCallId;
      apiMsg.content = msg.content;
    } else {
      apiMsg.content = msg.content;
    }

    if (msg.toolCalls && msg.toolCalls.length > 0) {
      apiMsg.tool_calls = msg.toolCalls.map((tc) => ({
        type: "function",
        id: tc.id,
        function: { name: tc.name, arguments: tc.arguments },
      }));
    }

    allMessages.push(apiMsg);
  }

  if (tools && tools.length > 0) {
    return { messages: allMessages, tools };
  }

  return { messages: allMessages };
}

interface ApiRequestBody {
  model: string;
  messages: Array<{
    role: string;
    content?: string;
    tool_calls?: { type: string; id: string; function: { name: string; arguments: string } }[];
    tool_call_id?: string;
  }>;
  stream: boolean;
  tools?: ToolDefinition[];
  tool_choice?: string;
  chat_template_kwargs?: {
    enable_thinking?: boolean
  };
  reasoning_effort?: string;
  thinking_budget_tokens?: number;
}

export async function makeApiCall(
  settings: ChatSettings,
  messages: ApiRequestBody["messages"],
  model: string,
  tools?: ToolDefinition[],
  signal?: AbortSignal,
  isSubagent?: boolean,
  reasoningEffort?: ReasoningEffort
): Promise<{ body: ApiRequestBody; stream: ReadableStreamDefaultReader<Uint8Array> }> {
  const baseUrl = settings.serverUrl.replace(/\/+$/, "");
  const apiUrl = `${baseUrl}/v1/chat/completions`;

  const body: ApiRequestBody = {
    model,
    messages,
    stream: true,
  };

  if (tools && tools.length > 0) {
    body.tools = tools.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
    body.tool_choice = "auto";
  }

  reasoningEffort ??= isSubagent ? 'medium' : 'none';
  body.reasoning_effort = reasoningEffort;
  body.thinking_budget_tokens = {
    none: 0,
    low: 128,
    medium: 512,
    high: 1024,
  }[reasoningEffort];
  
  body.chat_template_kwargs = { 
    enable_thinking: reasoningEffort !== 'none',
  };

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error (${response.status}): ${errorBody}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  return { body, stream: reader };
}
