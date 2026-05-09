import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, LLMStats, ProjectMeta } from "../types/chat";
import { ChatSettings } from "./useChatSettings";
import { appendMessage, loadMessages, updateChatMeta } from "./useChatPersistence";

function parseSSEChunk(chunk: string): { text: string; stats: LLMStats | null } {
  const lines = chunk.split("\n");
  let text = "";
  let stats: LLMStats | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data: ")) {
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          text += content;
        }
        // OpenAI-style usage
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
        // llamacpp-style timings (may appear alongside or instead of usage)
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
          // Merge: if we already have usage data, overlay timings on top;
          // otherwise use the timings-derived stats directly.
          if (stats) {
            stats = { ...stats, ...llamacppStats };
          } else {
            stats = llamacppStats;
          }
        }
      } catch {
        // ignore malformed JSON chunks
      }
    }
  }
  return { text, stats };
}

export function useChatApi(
  settings: ChatSettings,
  projectId?: string,
  chatId?: string,
  projectMeta?: ProjectMeta,
  agentSystemPrompt?: string,
  onTitleGenerated?: (chatId: string, name: string) => void
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (projectId && chatId) {
      loadMessages(projectId, chatId).then(setMessages);
    } else {
      setMessages([]);
    }
  }, [projectId, chatId]);

  const generateTitle = useCallback(
    async (userContent: string, assistantContent: string, model: string) => {
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
              { role: "user" as const, content: userContent },
              { role: "assistant" as const, content: assistantContent },
              { role: "user" as const, content: "Generate a 2-4 word title for this conversation. Respond with ONLY the title, nothing else." },
            ],
            stream: false,
            cache_prompt: false,
          }),
        });

        if (!response.ok) return;

        const data = await response.json();
        const title = data.choices?.[0]?.message?.content?.trim();
        if (!title) return;

        await updateChatMeta(projectId, chatId, { name: title });
        onTitleGenerated?.(chatId, title);
      } catch {
        // silently ignore title generation failures
      }
    },
    [projectId, chatId, settings, onTitleGenerated]
  );

  const sendMessage = useCallback(
    async (content: string, modelId: string) => {
      const effectiveModel = modelId;
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        const baseUrl = settings.serverUrl.replace(/\/+$/, "");
        const apiUrl = `${baseUrl}/v1/chat/completions`;

        const allMessages: Array<{ role: string; content: string }> = [];

        const systemPrompt = agentSystemPrompt || projectMeta?.systemPrompt || settings.systemPrompt;
        if (systemPrompt) {
          allMessages.push({ role: "system", content: systemPrompt });
        }

        for (const msg of messages) {
          allMessages.push({ role: msg.role, content: msg.content });
        }

        allMessages.push({ role: "user", content });

        const model = projectMeta?.defaultModel || settings.defaultModel || effectiveModel;

        const requestStartTime = Date.now();
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: allMessages,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API error (${response.status}): ${errorBody}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body");
        }

        const assistantId = crypto.randomUUID();
        const accumulated: string[] = [];
        let parsedStats: LLMStats | null = null;

        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
          },
        ]);

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Split on double newlines (SSE message boundary)
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";

          for (const part of parts) {
            const { text, stats } = parseSSEChunk(part);
            if (text) {
              accumulated.push(text);
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId
                    ? { ...msg, content: accumulated.join("") }
                    : msg
                )
              );
            }
            if (stats) {
              parsedStats = stats;
            }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
          const { text, stats } = parseSSEChunk(buffer);
          if (text) {
            accumulated.push(text);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantId
                  ? { ...msg, content: accumulated.join("") }
                  : msg
              )
            );
          }
          if (stats) {
            parsedStats = stats;
          }
        }

        const timeMs = Date.now() - requestStartTime;

        // Attach usage stats to the assistant message
        const finalContent = accumulated.join("");
        const assistantMessage: ChatMessage = {
          id: assistantId,
          role: "assistant",
          content: finalContent,
          timestamp: Date.now(),
        };

        if (parsedStats) {
          assistantMessage.stats = {
            ...parsedStats,
            timeMs,
          };
        }

        // Update the assistant message with stats in state, then persist
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantId ? assistantMessage : msg
          )
        );

        // Persist the completed conversation
        if (projectId && chatId) {
          await appendMessage(projectId, chatId, userMessage);
          await appendMessage(projectId, chatId, assistantMessage);

          // Generate title after the first exchange only
          if (messages.length === 0) {
            const titleModel = projectMeta?.defaultModel || settings.defaultModel || modelId;
            setTimeout(() => {
              generateTitle(userMessage.content, assistantMessage.content, titleModel);
            }, 0);
          }
        }
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
      }
    },
    [messages, settings, projectId, chatId, projectMeta, generateTitle]
  );

  const clearChat = useCallback(() => {
    setMessages([]);
  }, []);

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat,
    stopGeneration,
    setMessages,
  };
}
