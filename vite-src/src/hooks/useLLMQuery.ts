import { useState, useCallback, useRef, useEffect } from "react";
import { Agent, ChatMessage, LLMStats, ToolCall, ToolDefinition } from "../types/chat";
import { ChatSettings } from "./useChatSettings";
import { chatLogsStore } from "../store/chatLogs";
import { statsStore } from "../store/stats";
import {
  buildApiMessages,
  makeApiCall,
  parseSSEChunk,
  mergeStats,
} from "../utils/llmApi";

export interface LLMQueryOptions {
  settings: ChatSettings;
  projectId?: string;
  chatId?: string;
  queriesLogId?: string;
  systemPrompt?: string;
  model?: string;
  agentId?: string;
  agent?: Agent;
  allAgents?: Agent[];
  tools?: ToolDefinition[];
  folderPath?: string;
}

export interface LLMQueryResult {
  messages: ChatMessage[];
  finalMessage: ChatMessage;
  stats: LLMStats | null;
}

export async function runQuery(
  messages: ChatMessage[],
  options: LLMQueryOptions
): Promise<LLMQueryResult> {
  const {
    settings,
    projectId,
    chatId,
    queriesLogId,
    systemPrompt,
    model,
    agentId,
    tools,
    folderPath,
  } = options;

  const allTools = folderPath ? [] : (tools || []);
  const resolvedTools = allTools.filter(() => true);
  const systemPromptOrDefault = systemPrompt || settings.systemPrompt;

  const { messages: apiMessages } = buildApiMessages(messages, systemPromptOrDefault, resolvedTools);

  const requestStartTime = Date.now();

  const { stream } = await makeApiCall(
    settings,
    apiMessages,
    model || settings.defaultModel || "",
    resolvedTools,
    undefined,
    false
  );

  const assistantId = crypto.randomUUID();
  const accumulated: string[] = [];
  let parsedStats: LLMStats | null = null;
  const toolCallsMap = new Map<number, { id: string; name: string; args: string }>();

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await stream.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const result = parseSSEChunk(part);

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
  }

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
    .map(([, call]) => ({
      id: call.id,
      name: call.name,
      arguments: call.args,
    }));

  const assistantMessage: ChatMessage = {
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

  const allMessages = [...messages, assistantMessage];

  // Log stats
  if (parsedStats && projectId && chatId && queriesLogId) {
    statsStore.appendEntry(
      projectId,
      chatId,
      queriesLogId,
      parsedStats.model,
      agentId || "",
      parsedStats.promptTokens,
      parsedStats.completionTokens,
      parsedStats.totalTokens,
      parsedStats.timeMs,
      parsedStats.cacheN,
      parsedStats.promptN,
      parsedStats.promptMs,
      parsedStats.promptPerTokenMs,
      parsedStats.promptPerSecond,
      parsedStats.predictedN,
      parsedStats.predictedMs,
      parsedStats.predictedPerTokenMs,
      parsedStats.predictedPerSecond,
    ).catch(() => {});
  }

  // Log all messages to queries log
  if (queriesLogId && projectId) {
    for (const msg of allMessages) {
      await chatLogsStore.appendMessage(projectId, queriesLogId, msg);
    }
  }

  return {
    messages: allMessages,
    finalMessage: assistantMessage,
    stats: parsedStats,
  };
}

export function useLLMQuery(options: LLMQueryOptions) {
  const [result, setResult] = useState<LLMQueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(
    async (messages: ChatMessage[]) => {
      setIsLoading(true);
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const queryResult = await runQuery(messages, { ...options });
        setResult(queryResult);
        return queryResult;
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return null;
        }
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return {
    result,
    isLoading,
    execute,
  };
}
