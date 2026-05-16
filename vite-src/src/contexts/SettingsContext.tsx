import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { ChatSettings, useChatSettings } from "../hooks/useChatSettings";
import { useServerModels } from "../hooks/useServerModels";
import { ServerModel } from "../types/chat";

interface SettingsContextValue {
  settings: ChatSettings;
  updateSettings: (updates: Partial<ChatSettings>) => void;
  models: ServerModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  refetchModels: () => void;
  hiddenModels: string[];
  visibleModels: ServerModel[];
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, updateSettings] = useChatSettings();
  const {
    models,
    isLoading: modelsLoading,
    error: modelsError,
    refetch: refetchModels,
  } = useServerModels(settings.serverUrl, settings.apiKey);

  const visibleModels = useMemo(
    () => models.filter((m) => !settings.hiddenModels.includes(m.id)),
    [models, settings.hiddenModels]
  );

  const value = useMemo(
    () => ({
      settings,
      updateSettings,
      models,
      modelsLoading,
      modelsError,
      refetchModels,
      hiddenModels: settings.hiddenModels,
      visibleModels,
    }),
    [settings, updateSettings, models, modelsLoading, modelsError, refetchModels, visibleModels]
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
