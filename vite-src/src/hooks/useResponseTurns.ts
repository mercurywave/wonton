import { useMemo } from "react";
import { ChatMessage, ResponseTurnGroup } from "../types/chat";

/**
 * Derives response turn groups from a flat array of chat messages.
 * Each turn group contains: the user message, intermediate events (tool calls, results), and the final assistant response.
 */
export function deriveTurnGroups(messages: ChatMessage[]): ResponseTurnGroup[] {
  const turns: ResponseTurnGroup[] = [];

  // Find indices of all user messages
  const userIndices: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      userIndices.push(i);
    }
  }

  if (userIndices.length === 0) {
    return [];
  }

  for (let t = 0; t < userIndices.length; t++) {
    const userIdx = userIndices[t];
    const userMessage = messages[userIdx];

    // The range of messages belonging to this turn is from the user message
    // to just before the next user message (or to the end of the array)
    const nextUserIdx = t < userIndices.length - 1 ? userIndices[t + 1] : messages.length;

    // Find the last assistant message in this range
    let lastAssistantIdx = -1;
    for (let i = nextUserIdx - 1; i > userIdx; i--) {
      if (messages[i].role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }

    // If no assistant message found yet, the turn is incomplete
    const hasFinalResponse = lastAssistantIdx !== -1;

    // Intermediate messages are everything between the user message and the final response,
    // excluding system messages and the user message itself
    const intermediateMessages: ChatMessage[] = [];
    for (let i = userIdx + 1; i < nextUserIdx; i++) {
      if (i === lastAssistantIdx) continue; // skip the final response
      if (messages[i].role === "system") continue; // skip system messages
      intermediateMessages.push(messages[i]);
    }

    const finalAssistantMessage = hasFinalResponse ? messages[lastAssistantIdx] : messages[userIdx];

    turns.push({
      userMessage,
      intermediateMessages,
      finalAssistantMessage,
      isCompleted: hasFinalResponse,
    });
  }

  return turns;
}

/**
 * Hook that derives response turn groups from the chat messages array.
 * Uses useMemo for performance.
 */
export function useResponseTurns(messages: ChatMessage[], _isLoading: boolean): ResponseTurnGroup[] {
  return useMemo(() => deriveTurnGroups(messages), [messages]);
}
