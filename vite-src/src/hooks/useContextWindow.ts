import { ResolvedServerSettings } from "./useChatSettings";

export function useContextWindow(
  modelId: string,
  resolvedSettings: ResolvedServerSettings,
  defaultContextWindow: number
): { maxTokens: number } {
  const maxTokens = resolvedSettings.contextWindows[modelId] ?? defaultContextWindow;
  return { maxTokens };
}
