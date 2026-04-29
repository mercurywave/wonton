import { Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
import styles from "../components/Settings.module.css";
import { ChatSettings as ChatSettingsType } from "../hooks/useChatSettings";
import { ServerModel } from "../types/chat";

interface SettingsProps {
  settings: ChatSettingsType;
  onUpdate: (updates: Partial<ChatSettingsType>) => void;
  models: ServerModel[];
  modelsLoading: boolean;
  modelsError: string | null;
  onRefetch: () => void;
}

export default function Settings({
  settings,
  onUpdate,
  models,
  modelsLoading,
  modelsError,
  onRefetch,
}: SettingsProps) {
  const visibleModels = models.filter(
    (m) => !settings.hiddenModels.includes(m.id)
  );

  const handleToggleDefault = (modelId: string) => {
    onUpdate({ defaultModel: modelId });
  };

  const handleToggleHidden = (modelId: string) => {
    const hidden = settings.hiddenModels.includes(modelId);
    const next = hidden
      ? settings.hiddenModels.filter((id) => id !== modelId)
      : [...settings.hiddenModels, modelId];
    onUpdate({ hiddenModels: next });
    if (settings.defaultModel === modelId) {
      onUpdate({ defaultModel: "" });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
        <SettingsIcon size={20} />
        <h2>Settings</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="serverUrl">Server URL</label>
          <input
            id="serverUrl"
            type="url"
            className={styles.input}
            value={settings.serverUrl}
            onChange={(e) => onUpdate({ serverUrl: e.target.value })}
            placeholder="https://api.openai.com"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="apiKey">API Key</label>
          <input
            id="apiKey"
            type="password"
            className={styles.input}
            value={settings.apiKey}
            onChange={(e) => onUpdate({ apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="systemPrompt">System Prompt</label>
          <textarea
            id="systemPrompt"
            className={styles.textarea}
            value={settings.systemPrompt}
            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            placeholder="You are a helpful assistant."
            rows={4}
          />
        </div>

        <div className={styles.modelsSection}>
          <label>Models</label>

          {!settings.serverUrl.trim() && (
            <div className={styles.modelsPrompt}>
              Enter a server URL above to discover available models.
            </div>
          )}

          {settings.serverUrl.trim() && modelsLoading && (
            <div className={styles.modelsLoading}>Loading models...</div>
          )}

          {modelsError && (
            <div className={styles.modelsError}>
              <div className={styles.modelsErrorText}>{modelsError}</div>
              <button
                className={styles.retryButton}
                onClick={onRefetch}
              >
                Retry
              </button>
            </div>
          )}

          {visibleModels.length === 0 &&
            !modelsLoading &&
            !modelsError &&
            settings.serverUrl.trim() && (
              <div className={styles.modelsEmpty}>
                No models available on this server.
              </div>
            )}

          {visibleModels.length > 0 && (
            <div className={styles.modelsList}>
              {visibleModels.map((model) => (
                <div
                  key={model.id}
                  className={`${styles.modelRow} ${
                    model.id === settings.defaultModel
                      ? styles.modelRowDefault
                      : ""
                  }`}
                >
                  <button
                    className={styles.modelRadio}
                    onClick={() => handleToggleDefault(model.id)}
                    title={`Set "${model.id}" as default model`}
                  >
                    <span
                      className={`${styles.radioDot} ${
                        model.id === settings.defaultModel
                          ? styles.radioDotActive
                          : ""
                      }`}
                    />
                  </button>
                  <span className={styles.modelId}>{model.id}</span>
                  <button
                    className={styles.hideButton}
                    onClick={() => handleToggleHidden(model.id)}
                    title={`Hide "${model.id}" from model picker`}
                  >
                    {settings.hiddenModels.includes(model.id) ? (
                      <EyeOff size={14} />
                    ) : (
                      <Eye size={14} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
