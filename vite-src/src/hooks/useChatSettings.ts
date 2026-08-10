import { useState, useCallback, useMemo } from "react";
import { ReasoningEffort } from "../types/chat";
import type { ServerEntry } from "../types/server";

const STORAGE_KEY = "wonton_settings";

export interface ChatSettings {
  servers: ServerEntry[];
  activeServerId: string;
  systemPrompt: string;
  defaultContextWindow: number;
  reasoningEffort: ReasoningEffort;
  notificationBehavior: "always" | "unfocused" | "never";
  lastProjectId: string;
  // Deprecated legacy fields (kept for migration only)
  serverUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  hiddenModels?: string[];
  contextWindows?: Record<string, number>;
  modelAliases?: Record<string, string>;
}

export interface ResolvedServerSettings {
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  systemPrompt: string;
  hiddenModels: string[];
  contextWindows: Record<string, number>;
  modelAliases: Record<string, string>;
  reasoningEffort: ReasoningEffort;
}

const DEFAULT_SETTINGS: Omit<ChatSettings, "servers" | "activeServerId"> = {
  systemPrompt: "You are a helpful assistant.",
  defaultContextWindow: 131072,
  reasoningEffort: "none",
  notificationBehavior: "unfocused",
  lastProjectId: "default",
};

function generateServerId(): string {
  return crypto.randomUUID();
}

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url;
  }
}

function migrateLegacy(parsed: Record<string, unknown>): ChatSettings {
  const result: Partial<ChatSettings> = { ...DEFAULT_SETTINGS };

  // Check if already has new format
  if (Array.isArray(parsed.servers) && (parsed.servers as ServerEntry[]).length > 0) {
    return { ...DEFAULT_SETTINGS, ...parsed } as ChatSettings;
  }

  // Migrate old 'model' field to 'defaultModel'
  if ((parsed as { model?: string }).model && !parsed.defaultModel) {
    parsed.defaultModel = (parsed as { model?: string }).model;
  }
  delete (parsed as { model?: unknown }).model;

  // Create a server from legacy fields
  const serverUrl = (parsed.serverUrl as string) || "https://localhost";
  const server: ServerEntry = {
    id: generateServerId(),
    name: nameFromUrl(serverUrl),
    serverUrl,
    apiKey: (parsed.apiKey as string) || "",
    defaultModel: (parsed.defaultModel as string) || "",
    hiddenModels: (parsed.hiddenModels as string[]) || [],
    contextWindows: (parsed.contextWindows as Record<string, number>) || {},
    modelAliases: (parsed.modelAliases as Record<string, string>) || {},
  };

  result.servers = [server];
  result.activeServerId = server.id;

  return { ...DEFAULT_SETTINGS, ...result, servers: result.servers, activeServerId: result.activeServerId } as ChatSettings;
}

export function loadAndResolveSettings(): ResolvedServerSettings {
  const settings = loadSettings();
  return resolveSettings(settings);
}

export function loadSettings(): ChatSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return migrateLegacy(parsed);
    }
  } catch {
    // ignore parse errors
  }

  // Fresh install: create a default server
  const defaultServer: ServerEntry = {
    id: generateServerId(),
    name: "localhost",
    serverUrl: "https://localhost",
    apiKey: "",
    defaultModel: "",
    hiddenModels: [],
    contextWindows: {},
    modelAliases: {},
  };

  return {
    ...DEFAULT_SETTINGS,
    servers: [defaultServer],
    activeServerId: defaultServer.id,
  };
}

function saveSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function getActiveServer(settings: ChatSettings): ServerEntry | undefined {
  return settings.servers.find((s) => s.id === settings.activeServerId) || settings.servers[0];
}

export function resolveSettings(settings: ChatSettings): ResolvedServerSettings {
  const server = getActiveServer(settings);
  if (!server) {
    return {
      serverUrl: "",
      apiKey: "",
      defaultModel: "",
      systemPrompt: DEFAULT_SETTINGS.systemPrompt,
      hiddenModels: [],
      contextWindows: {},
      modelAliases: {},
      reasoningEffort: DEFAULT_SETTINGS.reasoningEffort,
    };
  }

  return {
    serverUrl: server.serverUrl,
    apiKey: server.apiKey,
    defaultModel: server.defaultModel,
    systemPrompt: settings.systemPrompt,
    hiddenModels: server.hiddenModels,
    contextWindows: server.contextWindows,
    modelAliases: server.modelAliases,
    reasoningEffort: settings.reasoningEffort,
  };
}

export function useChatSettings(): [
  ChatSettings,
  (updates: Partial<ChatSettings>) => void,
  ResolvedServerSettings,
  {
    servers: ServerEntry[];
    activeServer: ServerEntry | undefined;
    addServer: (entry: Omit<ServerEntry, "id">) => string;
    removeServer: (id: string) => void;
    updateServer: (id: string, updates: Partial<ServerEntry>) => void;
    setActiveServer: (id: string) => void;
  }
] {
  const [settings, setSettings] = useState<ChatSettings>(loadSettings);

  const updateSettings = useCallback((updates: Partial<ChatSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettings(next);
      return next;
    });
  }, []);

  const serverOps = useMemo(() => {
    return {
      servers: settings.servers,
      activeServer: getActiveServer(settings),
      addServer: (entry: Omit<ServerEntry, "id">) => {
        const newServer: ServerEntry = {
          ...entry,
          id: generateServerId(),
        };
        setSettings((prev) => {
          const next = {
            ...prev,
            servers: [...prev.servers, newServer],
            activeServerId: prev.activeServerId === newServer.id ? newServer.id : prev.activeServerId,
          };
          saveSettings(next);
          return next;
        });
        return newServer.id;
      },
      removeServer: (id: string) => {
        setSettings((prev) => {
          if (prev.servers.length <= 1) return prev;
          const next = {
            ...prev,
            servers: prev.servers.filter((s) => s.id !== id),
            activeServerId: prev.activeServerId === id ? prev.servers[0]?.id || "" : prev.activeServerId,
          };
          saveSettings(next);
          return next;
        });
      },
      updateServer: (id: string, updates: Partial<ServerEntry>) => {
        setSettings((prev) => {
          const next = {
            ...prev,
            servers: prev.servers.map((s) => (s.id === id ? { ...s, ...updates } : s)),
          };
          saveSettings(next);
          return next;
        });
      },
      setActiveServer: (id: string) => {
        setSettings((prev) => {
          if (prev.activeServerId === id) return prev;
          const next = { ...prev, activeServerId: id };
          saveSettings(next);
          return next;
        });
      },
    };
  }, [settings.servers, settings.activeServerId]);

  const resolvedSettings = useMemo(() => resolveSettings(settings), [settings]);

  return [settings, updateSettings, resolvedSettings, serverOps];
}
