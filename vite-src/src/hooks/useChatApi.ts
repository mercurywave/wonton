import { useState, useCallback, useRef } from "react";
import { ChatMessage } from "../types/chat";
import { ChatSettings } from "./useChatSettings";

export function useChatApi(settings: ChatSettings) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, modelId: string) => {
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

        if (settings.systemPrompt) {
          allMessages.push({ role: "system", content: settings.systemPrompt });
        }

        for (const msg of messages) {
          allMessages.push({ role: msg.role, content: msg.content });
        }

        allMessages.push({ role: "user", content });

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${settings.apiKey}`,
          },
          body: JSON.stringify({
            model: modelId,
            messages: allMessages,
            stream: false,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(`API error (${response.status}): ${errorBody}`);
        }

        const data = await response.json();
        const assistantContent =
          data.choices?.[0]?.message?.content ?? "";

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: assistantContent,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
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
    [messages, settings]
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
