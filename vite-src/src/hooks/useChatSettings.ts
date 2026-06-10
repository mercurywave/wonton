import { useState, useCallback } from "react";

const STORAGE_KEY = "wonton_settings";

export interface ChatSettings {
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  systemPrompt: string;
  hiddenModels: string[];
  defaultContextWindow: number;
  contextWindows: Record<string, number>;
  modelAliases: Record<string, string>;
  lastProjectId: string;
}

const DEFAULT_SETTINGS: ChatSettings = {
  serverUrl: "https://localhost",
  apiKey: "",
  defaultModel: "",
  systemPrompt: "You are a helpful assistant.",
  hiddenModels: [],
  defaultContextWindow: 131072,
  contextWindows: {},
  modelAliases: {},
  lastProjectId: "default",
};

export function loadSettings(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: Partial<ChatSettings> & { model?: string } = JSON.parse(stored);
      // Migrate old 'model' field to 'defaultModel'
      if (parsed.model && !parsed.defaultModel) {
        parsed.defaultModel = parsed.model;
      }
      // Remove deprecated 'model' field
      delete parsed.model;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore parse errors
  }
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

export function useChatSettings(): [ChatSettings, (updates: Partial<ChatSettings>) => void] {
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  return [settings, updateSettings];
}
