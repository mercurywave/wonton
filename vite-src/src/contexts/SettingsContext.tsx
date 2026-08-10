import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { ChatSettings, ResolvedServerSettings, useChatSettings } from "../hooks/useChatSettings";
import { useServerModels } from "../hooks/useServerModels";
import { ServerModel } from "../types/chat";
import type { ServerEntry } from "../types/server";

interface SettingsContextValue {
  settings: ChatSettings;
  updateSettings: (updates: Partial<ChatSettings>) => void;
  resolvedSettings: ResolvedServerSettings;
  models: ServerModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  refetchModels: () => void;
  hiddenModels: string[];
  visibleModels: ServerModel[];
  servers: ServerEntry[];
  activeServer: ServerEntry | undefined;
  addServer: (entry: Omit<ServerEntry, "id">) => string;
  removeServer: (id: string) => void;
  updateServer: (id: string, updates: Partial<ServerEntry>) => void;
  setActiveServer: (id: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, updateSettings, resolvedSettings, serverOps] = useChatSettings();
  const {
    models,
    isLoading: modelsLoading,
    error: modelsError,
    refetch: refetchModels,
  } = useServerModels(resolvedSettings.serverUrl, resolvedSettings.apiKey);

  const visibleModels = useMemo(
    () => models.filter((m) => !resolvedSettings.hiddenModels.includes(m.id)),
    [models, resolvedSettings.hiddenModels]
  );

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      resolvedSettings,
      models,
      modelsLoading,
      modelsError,
      refetchModels,
      hiddenModels: resolvedSettings.hiddenModels,
      visibleModels,
      servers: serverOps.servers,
      activeServer: serverOps.activeServer,
      addServer: serverOps.addServer,
      removeServer: serverOps.removeServer,
      updateServer: serverOps.updateServer,
      setActiveServer: serverOps.setActiveServer,
    }),
    [settings, updateSettings, resolvedSettings, models, modelsLoading, modelsError, refetchModels, visibleModels, serverOps]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return ctx;
}
