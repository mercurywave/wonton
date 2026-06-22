import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, LLMStats, ProjectMeta, ToolCall, Agent, ReasoningEffort } from "../types/chat";
import { ChatSettings } from "./useChatSettings";
import { runQuery } from "./useLLMQuery";
import { buildApiMessages, makeApiCall, mergeStats, parseSSEChunk } from "../utils/llmApi";

import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";
import { statsStore } from "../store/stats";
import { executeToolCall, filterToAvailableTools, getAvailableTools } from "../tools";
import { EXECUTE_SUBAGENT_TOOL_NAME } from "../tools/executeSubagent";
import { FeedbackPayload } from "../contexts";

interface ChatMessageWithToolCalls extends Omit<ChatMessage, "toolCalls"> {
  toolCalls?: ToolCall[];
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
  agentId?: string;
  agent?: Agent;
  allAgents?: Agent[];
  reasoningEffort?: ReasoningEffort;
  onUpdateMessage?: (messageId: string, content: string, toolCalls?: ToolCall[], role?: ChatMessage["role"], toolCallId?: string, reasoningContent?: string) => void;
  onChatUpdated?: () => void;
  onValidate?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>;
  onFinish?: () => void;
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
    agentId,
    agent,
    allAgents,
    reasoningEffort,
    onUpdateMessage,
    onChatUpdated,
    onValidate,
    onFinish,
  } = options;

  const tools = await filterToAvailableTools(toolNames, folderPath, agent, allAgents);

  const { messages: initialApiMessages } = buildApiMessages(initialMessages, systemPrompt, tools);

  let currentApiMessages = initialApiMessages;
  let allAssistantMessages: ChatMessageWithToolCalls[] = [];
  let hasMoreToolCalls = true;
  let round = 0;
  const MAX_TOOL_ROUNDS = 100;
  const persistedMessageIds = new Set<string>();
  const requestStartTime = Date.now();

  // First message is the user message, persist it
  const userMessage = initialMessages[initialMessages.length - 1];
  if (round === 0 && projectId && logId && userMessage) {
    await chatLogsStore.appendMessage(projectId, logId, userMessage);
    persistedMessageIds.add(userMessage.id);
  }

  while (hasMoreToolCalls && round < MAX_TOOL_ROUNDS) {
    const { stream: roundStream } = await makeApiCall(
      settings,
      currentApiMessages,
      model,
      tools,
      signal,
      isSubagent,
      reasoningEffort
    );

    const assistantId = crypto.randomUUID();
    const accumulated: string[] = [];
    const accumulatedReasoning: string[] = [];
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
        }
        if (result.reasoningText) {
          accumulatedReasoning.push(result.reasoningText);
        }
        onUpdateMessage?.(assistantId, accumulated.join(""), Array.from(toolCallsMap.entries())
          .filter(([, call]) => call.id && call.name)
          .map(([, call]) => ({ id: call.id, name: call.name, arguments: call.args })),
          "assistant",
          undefined,
          accumulatedReasoning.join(""));
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
      if (result.reasoningText) {
        accumulatedReasoning.push(result.reasoningText);
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
        logId: call.name === EXECUTE_SUBAGENT_TOOL_NAME ? crypto.randomUUID() : undefined,
      }));

    const assistantMessage: ChatMessageWithToolCalls = {
      id: assistantId,
      role: "assistant",
      content: accumulated.join(""),
      reasoningContent: accumulatedReasoning.join("") || undefined,
      timestamp: Date.now(),
    };

    if (parsedStats) {
      assistantMessage.stats = { ...parsedStats, timeMs: Date.now() - requestStartTime };
    }

    // Record stats for this API call
    if (parsedStats && projectId && chatId && logId) {
      statsStore.appendEntry(
        projectId,
        chatId,
        logId,
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

        const result = await executeToolCall(tc.name, tc, args, {
          folderPath,
          projectId,
          chatId,
          logId,
          settings,
          onChatUpdated,
          showFeedback: onValidate as any,
        });

        // Update the tool result message with actual content
        const toolResultMessage = toolResults[i];
        toolResultMessage.content = result.content;
        onUpdateMessage?.(toolResultMessage.id, result.content, [], "tool", toolResultMessage.toolCallId);
      }

      // Persist assistant message and its tool results in order
      if (projectId && logId) {
        await chatLogsStore.appendMessage(projectId, logId, assistantMessage);
        persistedMessageIds.add(assistantMessage.id);
        for (const tr of toolResults) {
          await chatLogsStore.appendMessage(projectId, logId, tr);
          persistedMessageIds.add(tr.id);
        }
      }

      // Build next API call with assistant message and tool results appended
      currentApiMessages = [...currentApiMessages, {
        role: "assistant" as const,
        content: assistantMessage.content,
        tool_calls: assistantMessage.toolCalls?.map((tc) => ({
          type: "function" as const,
          id: tc.id,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      }, ...toolResults.map((tr) => ({
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
      await chatLogsStore.appendMessage(projectId, logId, msg);
    }
  }

  const allMessages = [...initialMessages, ...allAssistantMessages];
  for (const am of allAssistantMessages) {
    if (am.toolCalls?.length) {
      // tool result messages are appended after each assistant round
    }
  }

  onFinish?.();

  return { finalMessage: finalAssistantMessage, allMessages, stats: finalAssistantMessage.stats || null };
}

export function useChatApi(
  settings: ChatSettings,
  chatId?: string,
  projectId?: string,
  projectMeta?: ProjectMeta,
  agentSystemPrompt?: string,
  onTitleGenerated?: (chatId: string, name: string) => void,
  folderPath?: string,
  logId?: string,
  onChatUpdated?: () => void,
  onSendPrompt?: () => Promise<void>,
  onChatResponse?: (response: ChatMessage) => Promise<void>,
  agentId?: string,
  allAgents?: Agent[],
  onValidate?: (projectId: string, chatId: string, logId: string, payload: import("../contexts").FeedbackPayload) => Promise<number | string | void>,
  reasoningEffort?: ReasoningEffort,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const loadRequestIdRef = useRef(0);

  useEffect(() => {
    if (projectId && chatId) {
      const loadAndSet = (targetLogId: string, requestId: number) => {
        chatLogsStore.load(projectId, targetLogId).then(() => {
          if (requestId !== loadRequestIdRef.current) return;
          const msgs = chatLogsStore.getLog(projectId, targetLogId) || [];
          setMessages(msgs);
        });
      };
      const requestId = ++loadRequestIdRef.current;
      if (logId) {
        loadAndSet(logId, requestId);
      } else {
        chatStore.load(projectId).then(() => {
          if (requestId !== loadRequestIdRef.current) return;
          const resolvedLogId = chatStore.getLogId(projectId, chatId);
          loadAndSet(resolvedLogId, requestId);
        });
      }

      const targetLogId = logId || (chatStore.getLogId(projectId, chatId) ?? "");
      const unsubscribe = chatLogsStore.subscribe(projectId, targetLogId, () => {
        const msgs = chatLogsStore.getLog(projectId, targetLogId) || [];
        setMessages(msgs);
      });
      return unsubscribe;
    } else {
      setMessages([]);
    }
  }, [projectId, chatId, logId]);

  const generateTitle = useCallback(
    async (userContent: string, model: string) => {
      if (!projectId || !chatId) return;

      try {
        await chatStore.load(projectId);
        const metas = chatStore.getChatMetas(projectId);
        const meta = metas.find((m) => m.id === chatId);
        if (!meta?.queriesLogId) return;

        const titlePrompt = "Generate a 2-4 word title for this conversation based on the previous prompt. Do not act on the previous prompt Respond with ONLY the title, nothing else.";
        const messages: ChatMessage[] = [
          {
            id: crypto.randomUUID(),
            role: "user",
            content: userContent,
            timestamp: Date.now(),
          },
          {
            id: crypto.randomUUID(),
            role: "user",
            content: titlePrompt,
            timestamp: Date.now(),
          },
        ];

        const result = await runQuery(messages, {
          settings,
          projectId,
          chatId,
          model,
        });

        if (!result) return;

        const title = result.finalMessage.content?.trim();
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

      if(projectId && chatId) await chatStore.setChatDraft(projectId, chatId, "");

      setIsLoading(true);

      if(chatId && projectId && logId){
        const pendingMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          toolCalls: [],
        };
        chatLogsStore.setPendingMessage(projectId, logId, pendingMsg);
      }

      try {
        const resolvedAgentId = agentId || "builtin:default";
        const agent = allAgents?.find((a) => a.id === resolvedAgentId);

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

        const resolvedTools = await getAvailableTools(folderPath, agent, allAgents);

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
          agentId: resolvedAgentId,
          agent,
          allAgents,
          reasoningEffort,
          onUpdateMessage: (messageId, messageContent, messageToolCalls, messageRole, messageToolCallId, messageReasoningContent) => {
            if (logId) {
              const pending = chatLogsStore.getPendingMessage(projectId!, logId);
              const baseMsg = (pending?.id === messageId) ? pending : { id: messageId, timestamp: Date.now() };
              chatLogsStore.updatePendingMessage(projectId!, logId, {
                ...baseMsg,
                content: messageContent,
                reasoningContent: messageReasoningContent,
                toolCalls: messageToolCalls || [],
                role: (messageRole || "assistant") as ChatMessage["role"],
                toolCallId: messageToolCallId,
              });
            }
          },
          onChatUpdated,
          onValidate,
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
        if (projectId && logId) {
          chatLogsStore.clearPendingMessage(projectId, logId);
        }
      }
    },
    [settings, projectId, chatId, projectMeta, agentSystemPrompt, generateTitle, folderPath, onSendPrompt, onChatResponse, agentId, onValidate]
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    if (projectId && logId) {
      chatLogsStore.clearPendingMessage(projectId, logId);
    }
  }, [projectId, logId]);

  return {
    messages,
    isLoading,
    sendMessage,
    stopGeneration,
    setMessages,
  };
}
