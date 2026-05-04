import { useState, useCallback, useRef, useEffect } from "react";
import { ChatMessage, ProjectMeta } from "../types/chat";
import { ChatSettings } from "./useChatSettings";
import { appendMessage, loadMessages } from "./useChatPersistence";

function parseSSEChunk(chunk: string): string {
  const lines = chunk.split("\n");
  let text = "";
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
      } catch {
        // ignore malformed JSON chunks
      }
    }
  }
  return text;
}

export function useChatApi(
  settings: ChatSettings,
  projectId?: string,
  chatId?: string,
  projectMeta?: ProjectMeta
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

        const systemPrompt = projectMeta?.systemPrompt || settings.systemPrompt;
        if (systemPrompt) {
          allMessages.push({ role: "system", content: systemPrompt });
        }

        for (const msg of messages) {
          allMessages.push({ role: msg.role, content: msg.content });
        }

        allMessages.push({ role: "user", content });

        const model = projectMeta?.defaultModel || settings.defaultModel || effectiveModel;

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
            const text = parseSSEChunk(part);
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
          }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
          const text = parseSSEChunk(buffer);
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
        }

        // Persist the completed conversation
        if (projectId && chatId) {
          const finalContent = accumulated.join("");
          const finalMessages = [...messages, userMessage, { id: assistantId, role: "assistant" as const, content: finalContent, timestamp: Date.now() }];
          for (const msg of finalMessages) {
            await appendMessage(projectId, chatId, msg);
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
    [messages, settings, projectId, chatId, projectMeta]
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
