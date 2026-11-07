import { useState, useCallback, useMemo, useEffect } from "react";
import { ReasoningEffort } from "../types/chat";
import type { ServerEntry } from "../types/server";
import { filesystem } from "../utils/electronFs";
import { getRootDataDir, isBackendConnected, SETTINGS_FILE_NAME, STATE_FILE_NAME } from "../utils/platformUtils";

export interface ChatSettings {
  servers: ServerEntry[];
  activeServerId: string;
  systemPrompt: string;
  defaultContextWindow: number;
  reasoningEffort: ReasoningEffort;
  notificationBehavior: "always" | "unfocused" | "never";
  lastProjectId: string;
  porkbunServerUrl: string;
  porkbunApiKey: string;
  porkbunLlmServerId: string;
  porkbunModelId: string;
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

interface ChatStateFile {
  activeServerId: string;
  lastProjectId: string;
}

const DEFAULT_SETTINGS: Omit<ChatSettings, "servers" | "activeServerId"> = {
  systemPrompt: "You are a helpful assistant.",
  defaultContextWindow: 131072,
  reasoningEffort: "none",
  notificationBehavior: "unfocused",
  lastProjectId: "default",
  porkbunServerUrl: "",
  porkbunApiKey: "",
  porkbunLlmServerId: "",
  porkbunModelId: "",
};

let cachedSettings: ChatSettings | null = null;

function generateServerId(): string {
  return crypto.randomUUID();
}

function createDefaultServer(): ServerEntry {
  return {
    id: generateServerId(),
    name: "localhost",
    serverUrl: "https://localhost",
    apiKey: "",
    defaultModel: "",
    hiddenModels: [],
    contextWindows: {},
    modelAliases: {},
  };
}

function createDefaultSettings(): ChatSettings {
  const defaultServer = createDefaultServer();
  return {
    ...DEFAULT_SETTINGS,
    servers: [defaultServer],
    activeServerId: defaultServer.id,
  };
}

async function getSettingsFilePath(): Promise<string> {
  const rootDir = await getRootDataDir();
  return `${rootDir}/${SETTINGS_FILE_NAME}`;
}

async function getStateFilePath(): Promise<string> {
  const rootDir = await getRootDataDir();
  return `${rootDir}/${STATE_FILE_NAME}`;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  if (!isBackendConnected()) return null;

  try {
    const content = await filesystem.tryReadFile(filePath);
    if (content === null || !content.trim()) return null;
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function ensureRootDataDir(): Promise<void> {
  if (!isBackendConnected()) return;

  try {
    const rootDir = await getRootDataDir();
    if (!rootDir || !rootDir.trim()) return;
    await filesystem.createDirectory(rootDir);
  } catch {
    // directory may already exist
  }
}

async function hydrateSettingsFromDisk(): Promise<ChatSettings> {
  const defaults = createDefaultSettings();

  if (!isBackendConnected()) {
    cachedSettings = defaults;
    return defaults;
  }

  try {
    await ensureRootDataDir();
    const [storedSettings, storedState] = await Promise.all([
      readJsonFile<Partial<ChatSettings>>(await getSettingsFilePath()),
      readJsonFile<Partial<ChatStateFile>>(await getStateFilePath()),
    ]);

    const nextSettings: ChatSettings = {
      ...defaults,
      ...(storedSettings ?? {}),
      servers: Array.isArray(storedSettings?.servers) && storedSettings.servers.length > 0
        ? storedSettings.servers
        : defaults.servers,
    };

    const nextState: ChatStateFile = {
      activeServerId: typeof storedState?.activeServerId === "string" && storedState.activeServerId
        ? storedState.activeServerId
        : nextSettings.activeServerId,
      lastProjectId: typeof storedState?.lastProjectId === "string" && storedState.lastProjectId
        ? storedState.lastProjectId
        : DEFAULT_SETTINGS.lastProjectId,
    };

    const activeServer = nextSettings.servers.find((s) => s.id === nextState.activeServerId) ?? nextSettings.servers[0];
    nextSettings.activeServerId = activeServer?.id ?? nextSettings.servers[0]?.id ?? "";
    nextSettings.lastProjectId = nextState.lastProjectId;

    if (!storedSettings || !storedState) {
      await persistSettings(nextSettings);
    }

    cachedSettings = nextSettings;
    return nextSettings;
  } catch {
    cachedSettings = defaults;
    return defaults;
  }
}

async function persistSettings(settings: ChatSettings): Promise<void> {
  if (!isBackendConnected()) return;

  try {
    await ensureRootDataDir();
    const rootDir = await getRootDataDir();
    const { activeServerId, lastProjectId, ...settingsBlob } = settings;
    const settingsPath = `${rootDir}/${SETTINGS_FILE_NAME}`;
    const statePath = `${rootDir}/${STATE_FILE_NAME}`;

    await filesystem.writeFile(settingsPath, JSON.stringify(settingsBlob, null, 2));
    await filesystem.writeFile(statePath, JSON.stringify({ activeServerId, lastProjectId }, null, 2));

    cachedSettings = settings;
  } catch {
    // ignore storage errors
  }
}

function saveSettings(settings: ChatSettings): void {
  void persistSettings(settings);
}

export function loadAndResolveSettings(): ResolvedServerSettings {
  const settings = loadSettings();
  return resolveSettings(settings);
}

export function loadSettings(): ChatSettings {
  return cachedSettings ?? createDefaultSettings();
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

void hydrateSettingsFromDisk();

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
  const [settings, setSettings] = useState<ChatSettings>(() => loadSettings());

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const next = await hydrateSettingsFromDisk();
      if (!cancelled) {
        setSettings(next);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

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
