import { useState, useCallback } from "react";

const STORAGE_KEY = "wonton_settings";

export interface ChatSettings {
  serverUrl: string;
  apiKey: string;
  model: string;
  systemPrompt: string;
}

const DEFAULT_SETTINGS: ChatSettings = {
  serverUrl: "https://api.openai.com",
  apiKey: "",
  model: "gpt-3.5-turbo",
  systemPrompt: "You are a helpful assistant.",
};

function loadSettings(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
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
