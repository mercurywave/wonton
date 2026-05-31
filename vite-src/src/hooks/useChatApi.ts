import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, LLMStats, ProjectMeta, ToolCall, ToolDefinition } from "../types/chat";
import { ChatSettings } from "./useChatSettings";
import { appendMessage, loadMessages, loadMessagesByLogId } from "./useChatPersistence";
import { chatStore } from "../store/chats";
import { executeToolCall } from "../tools";
import { getAvailableTools } from "../tools";

interface SSEDelta {
  content?: string;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}

interface ChatMessageWithToolCalls extends Omit<ChatMessage, "toolCalls"> {
  toolCalls?: ToolCall[];
}

interface SSEChunkResult {
  text: string;
  stats: LLMStats | null;
  toolCalls: Array<{ index: number; id: string; name: string; args: string }>;
}

function parseSSEChunk(chunk: string): SSEChunkResult {
  let text = "";
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

  return { text, stats, toolCalls };
}

function mergeStats(existing: LLMStats | null, incoming: LLMStats | null): LLMStats | null {
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

function buildApiMessages(
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
  chat_template_kwargs?: { enable_thinking: boolean };
}

async function makeApiCall(
  settings: ChatSettings,
  messages: ApiRequestBody["messages"],
  model: string,
  tools?: ToolDefinition[],
  signal?: AbortSignal,
  isSubagent?: boolean
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

  if (isSubagent) {
    body.chat_template_kwargs = { enable_thinking: true };
  }

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

interface ToolCallLoopOptions {
  settings: ChatSettings;
  systemPrompt: string;
  model: string;
  toolNames: string[];
  folderPath?: string;
  initialMessages: ChatMessage[];
  signal?: AbortSignal;
  projectId?: string;
  chatId?: string;
  logId?: string;
  isSubagent?: boolean;
  onUpdateMessage?: (messageId: string, content: string, toolCalls?: ToolCall[], role?: ChatMessage["role"], toolCallId?: string) => void;
  onChatUpdated?: () => void;
}

interface ToolCallLoopResult {
  finalMessage: ChatMessageWithToolCalls;
  allMessages: ChatMessage[];
  stats: LLMStats | null;
}

export async function runToolCallLoop(options: ToolCallLoopOptions): Promise<ToolCallLoopResult> {
  const {
    settings,
    systemPrompt,
    model,
    toolNames,
    folderPath,
    initialMessages,
    signal,
    projectId,
    chatId,
    logId,
    isSubagent,
    onUpdateMessage,
    onChatUpdated,
  } = options;

  const tools = getAvailableTools(folderPath).filter(t => toolNames.includes(t.function.name));

  const { messages: initialApiMessages } = buildApiMessages(initialMessages, systemPrompt, tools);

  let currentApiMessages: ApiRequestBody["messages"] = initialApiMessages;
  let allAssistantMessages: ChatMessageWithToolCalls[] = [];
  let hasMoreToolCalls = true;
  let round = 0;
  const MAX_TOOL_ROUNDS = 10;
  const persistedMessageIds = new Set<string>();
  const requestStartTime = Date.now();

  // First message is the user message, persist it
  const userMessage = initialMessages[initialMessages.length - 1];
  if (round === 0 && projectId && logId && userMessage) {
    await appendMessage(projectId, logId, userMessage, chatId);
    persistedMessageIds.add(userMessage.id);
  }

  while (hasMoreToolCalls && round < MAX_TOOL_ROUNDS) {
    const { stream: roundStream } = await makeApiCall(
      settings,
      currentApiMessages,
      model,
      tools,
      signal,
      isSubagent
    );

    const assistantId = crypto.randomUUID();
    const accumulated: string[] = [];
    let parsedStats: LLMStats | null = null;
    const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();

    // Notify caller of new assistant message
    onUpdateMessage?.(assistantId, "", [], "assistant");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await roundStream.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const result = parseSSEChunk(part);

        if (result.text) {
          accumulated.push(result.text);
          onUpdateMessage?.(assistantId, accumulated.join(""), Array.from(toolCallsMap.entries())
            .filter(([, call]) => call.id && call.name)
            .map(([, call]) => ({ id: call.id, name: call.name, arguments: call.args })),
            "assistant");
        }
        parsedStats = mergeStats(parsedStats, result.stats);

        for (const call of result.toolCalls) {
          const existing = toolCallsMap.get(call.index);
          if (existing) {
            if (call.id) existing.id = call.id;
            if (call.name) existing.name = call.name;
            if (call.args) existing.args += call.args;
          } else {
            toolCallsMap.set(call.index, { id: call.id, name: call.name, args: call.args });
          }
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const result = parseSSEChunk(buffer);

      if (result.text) {
        accumulated.push(result.text);
      }
      parsedStats = mergeStats(parsedStats, result.stats);

      for (const call of result.toolCalls) {
        const existing = toolCallsMap.get(call.index);
        if (existing) {
          if (call.id) existing.id = call.id;
          if (call.name) existing.name = call.name;
          if (call.args) existing.args += call.args;
        } else {
          toolCallsMap.set(call.index, { id: call.id, name: call.name, args: call.args });
        }
      }
    }

    const toolCalls: ToolCall[] = Array.from(toolCallsMap.entries())
      .filter(([, call]) => call.id && call.name)
      .map(([, call]) => ({ id: call.id, name: call.name, arguments: call.args }));

    const assistantMessage: ChatMessageWithToolCalls = {
      id: assistantId,
      role: "assistant",
      content: accumulated.join(""),
      timestamp: Date.now(),
    };

    if (parsedStats) {
      assistantMessage.stats = { ...parsedStats, timeMs: Date.now() - requestStartTime };
    }

    if (toolCalls.length > 0) {
      assistantMessage.toolCalls = toolCalls;
    }

    allAssistantMessages.push(assistantMessage);

    if (toolCalls.length === 0) {
      hasMoreToolCalls = false;
    } else {
      const toolResults: ChatMessage[] = [];

      // Create partial tool result messages before executing tool calls
      for (const tc of toolCalls) {
        const toolResultMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "tool",
          content: "",
          timestamp: Date.now(),
          toolCallId: tc.id,
        };
        toolResults.push(toolResultMessage);

        // Broadcast partial tool result message immediately
        onUpdateMessage?.(toolResultMessage.id, toolResultMessage.content, [], "tool", toolResultMessage.toolCallId);
      }

      // Notify caller of updated assistant message
      onUpdateMessage?.(assistantId, assistantMessage.content, toolCalls, "assistant");

      // Execute tool calls and update results
      for (let i = 0; i < toolCalls.length; i++) {
        const tc = toolCalls[i];
        let args: object = {};
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = { raw: tc.arguments };
        }

        const result = await executeToolCall(tc.name, args, {
          folderPath,
          projectId,
          chatId,
          settings,
          onChatUpdated,
        });

        // Update the tool result message with actual content
        const toolResultMessage = toolResults[i];
        toolResultMessage.content = result.content;
        onUpdateMessage?.(toolResultMessage.id, result.content, [], "tool", toolResultMessage.toolCallId);
      }

      // Persist assistant message and its tool results in order
      if (projectId && logId) {
        await appendMessage(projectId, logId, assistantMessage, chatId);
        persistedMessageIds.add(assistantMessage.id);
        for (const tr of toolResults) {
          await appendMessage(projectId, logId, tr, chatId);
          persistedMessageIds.add(tr.id);
        }
      }

      // Build next API call with tool results appended
      currentApiMessages = [...currentApiMessages, ...toolResults.map((tr) => ({
        role: "tool" as const,
        tool_call_id: tr.toolCallId,
        content: tr.content,
      }))];

      round++;
    }
  }

  // The last assistant message is the final response
  const finalAssistantMessage = allAssistantMessages[allAssistantMessages.length - 1];

  // Persist any remaining assistant messages
  if (projectId && logId) {
    for (const msg of allAssistantMessages) {
      if (persistedMessageIds.has(msg.id)) continue;
      await appendMessage(projectId, logId, msg, chatId);
    }
  }

  const allMessages = [...initialMessages, ...allAssistantMessages];
  for (const am of allAssistantMessages) {
    if (am.toolCalls?.length) {
      // tool result messages are appended after each assistant round
    }
  }

  return { finalMessage: finalAssistantMessage, allMessages, stats: finalAssistantMessage.stats || null };
}

export function useChatApi(
  settings: ChatSettings,
  chatExecutionIds: Map<string, string>,
  setChatExecutionId: (chatId: string, executionId: string | null) => void,
  chatId?: string,
  projectId?: string,
  projectMeta?: ProjectMeta,
  agentSystemPrompt?: string,
  onTitleGenerated?: (chatId: string, name: string) => void,
  tools?: ToolDefinition[],
  folderPath?: string,
  logId?: string,
  onChatUpdated?: () => void,
  onSendPrompt?: () => Promise<void>,
  onChatResponse?: (response: ChatMessage) => Promise<void>,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    if (projectId && chatId) {
      if (logId) {
        loadMessagesByLogId(projectId, logId).then(setMessages);
      } else {
        loadMessages(projectId, chatId, chatExecutionIds).then(setMessages);
      }
    } else {
      setMessages([]);
    }
  }, [projectId, chatId, logId]);

  const generateTitle = useCallback(
    async (userContent: string, model: string) => {
      if (!projectId || !chatId) return;

      const baseUrl = settings.serverUrl.replace(/\/+$/, "");
      const apiUrl = `${baseUrl}/v1/chat/completions`;

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "user", content: userContent },
              { role: "user", content: "Generate a 2-4 word title for this conversation based on the previous prompt. Do not act on the previous prompt Respond with ONLY the title, nothing else." },
            ],
            stream: false,
            cache_prompt: false,
          }),
        });

        if (!response.ok) return;

        const data = await response.json();
        const title = data.choices?.[0]?.message?.content?.trim();
        if (!title) return;

        await chatStore.updateChatMeta(projectId, chatId, { name: title });
        onTitleGenerated?.(chatId, title);
      } catch {
        // silently ignore title generation failures
      }
    },
    [projectId, chatId, settings, onTitleGenerated]
  );

  const sendMessage = useCallback(
    async (content: string, modelId: string, originalContent?: string) => {
      const effectiveModel = modelId;
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
        originalContent: originalContent || undefined,
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      if(chatId){
        setChatExecutionId(chatId, crypto.randomUUID());
      }

      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const systemPrompt = agentSystemPrompt || projectMeta?.systemPrompt || settings.systemPrompt;
        const model = projectMeta?.defaultModel || settings.defaultModel || effectiveModel;

        // Generate title before kicking off the agent (only for first message)
        if (messagesRef.current.length === 0 && projectId && chatId) {
          const titleModel = projectMeta?.defaultModel || settings.defaultModel || modelId;
          generateTitle(originalContent || content, titleModel).catch(() => {});
        }

        // Include userMessage since setMessages is async and messages state is stale
        const allMessagesForApi = [...messagesRef.current, userMessage];

        const resolvedTools = tools || [];

        await onSendPrompt?.();

        const toolCallResult = await runToolCallLoop({
          settings,
          systemPrompt,
          model,
          toolNames: resolvedTools.map(t => t.function.name),
          folderPath,
          initialMessages: allMessagesForApi,
          signal: controller.signal,
          projectId,
          chatId,
          logId,
          onUpdateMessage: (messageId, messageContent, messageToolCalls, messageRole, messageToolCallId) => {
            setChatExecutionId(chatId!, messageId);
            setMessages((prev) => {
              const existing = prev.find(m => m.id === messageId);
              if (existing) {
                return prev.map(m =>
                  m.id === messageId
                    ? { ...m, content: messageContent, toolCalls: messageToolCalls || m.toolCalls }
                    : m
                );
              }
              return [...prev, {
                id: messageId,
                role: messageRole || "assistant" as const,
                content: messageContent,
                timestamp: Date.now(),
                toolCalls: messageToolCalls || [],
                toolCallId: messageToolCallId,
              } as ChatMessageWithToolCalls];
            });
          },
          onChatUpdated,
        });

        // Run onChatResponse hook on the final assistant message
        if (toolCallResult) {
          await onChatResponse?.(toolCallResult.finalMessage);
        }

        // Tool result messages are added inline in onUpdateMessage

      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        const errorMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: error instanceof Error ? error.message : "Unknown error occurred",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        setChatExecutionId(chatId!, null);
      }
    },
    [settings, projectId, chatId, projectMeta, agentSystemPrompt, generateTitle, tools, folderPath, setChatExecutionId, onSendPrompt, onChatResponse]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setChatExecutionId(chatId!, null);
  }, [setChatExecutionId]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    stopGeneration,
    setMessages,
  };
}
