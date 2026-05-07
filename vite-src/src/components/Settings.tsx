import { Settings as SettingsIcon, Eye, EyeOff, Check } from "lucide-react";
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
  const allModels = models;

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

  const handleContextChange = (modelId: string, value: string) => {
    const num = parseInt(value);
    const next = { ...settings.contextWindows };
    if (num > 0) {
      next[modelId] = num;
    } else {
      delete next[modelId];
    }
    onUpdate({ contextWindows: next });
  };

  const handleAliasChange = (modelId: string, value: string) => {
    const next = { ...settings.modelAliases };
    if (value.trim()) {
      next[modelId] = value;
    } else {
      delete next[modelId];
    }
    onUpdate({ modelAliases: next });
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

          <div className={styles.field}>
            <label htmlFor="defaultContextWindow">Default Context Window (tokens)</label>
            <input
              id="defaultContextWindow"
              type="number"
              className={styles.input}
              value={settings.defaultContextWindow}
              onChange={(e) => onUpdate({ defaultContextWindow: parseInt(e.target.value) || 0 })}
              placeholder="131072"
              min={1024}
              step={1024}
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
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}

            {allModels.length === 0 &&
              !modelsLoading &&
              !modelsError &&
              settings.serverUrl.trim() && (
                <div className={styles.modelsEmpty}>
                  No models available on this server.
                </div>
              )}

            {allModels.length > 0 && (
              <div className={styles.modelsList}>
                {allModels.map((model) => {
                  const isDefault = model.id === settings.defaultModel;
                  const isHidden = settings.hiddenModels.includes(model.id);
                  const customContext = model.id in settings.contextWindows;
                  const contextValue = settings.contextWindows[model.id] ?? "";
                  const aliasValue = settings.modelAliases[model.id] ?? "";

                  return (
                    <div
                      key={model.id}
                      className={`${styles.modelCard} ${isDefault ? styles.modelCardDefault : ""} ${isHidden ? styles.modelCardHidden : ""}`}
                    >
                      <div className={styles.modelCardHeader}>
                        <span className={`${styles.modelId} ${isHidden ? styles.modelIdHidden : ""}`}>{model.id}</span>
                        <button
                          className={`${styles.defaultButton} ${isDefault ? styles.defaultButtonActive : ""} ${isHidden ? styles.defaultButtonDisabled : ""}`}
                          onClick={() => !isHidden && handleToggleDefault(model.id)}
                          type="button"
                          title={isDefault ? "Remove default" : "Set as default model"}
                          disabled={isHidden}
                        >
                          <Check size={14} />
                          <span>Default</span>
                        </button>
                      </div>

                      <div className={styles.modelCardBody}>
                        <div className={styles.aliasField}>
                          <label htmlFor={`alias-${model.id}`}>Alias</label>
                          <input
                            id={`alias-${model.id}`}
                            type="text"
                            className={styles.aliasInput}
                            value={aliasValue}
                            onChange={(e) => !isHidden && handleAliasChange(model.id, e.target.value)}
                            placeholder="Optional display name"
                            disabled={isHidden}
                          />
                        </div>

                        <div className={styles.contextField}>
                          <label htmlFor={`context-${model.id}`}>Context Window</label>
                          <input
                            id={`context-${model.id}`}
                            type="number"
                            className={styles.contextInput}
                            value={contextValue}
                            onChange={(e) => !isHidden && handleContextChange(model.id, e.target.value)}
                            placeholder={settings.defaultContextWindow.toString()}
                            min={1024}
                            step={1024}
                            title={customContext ? "Custom context window for this model" : "Empty = use default"}
                            disabled={isHidden}
                          />
                        </div>

                        <button
                          className={styles.hideButton}
                          onClick={() => handleToggleHidden(model.id)}
                          type="button"
                          title={isHidden ? "Show model" : "Hide model"}
                        >
                          {isHidden ? (
                            <Eye size={14} />
                          ) : (
                            <EyeOff size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
