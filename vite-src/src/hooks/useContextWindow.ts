import { ChatSettings } from "./useChatSettings";

export function useContextWindow(
  modelId: string,
  settings: ChatSettings
): { maxTokens: number } {
  const maxTokens = settings.contextWindows[modelId] ?? settings.defaultContextWindow;
  return { maxTokens };
}
