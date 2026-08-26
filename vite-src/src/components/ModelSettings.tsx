import { Cpu } from "lucide-react";
import { Check, Eye, EyeOff } from "lucide-react";
import styles from "../components/ModelSettings.module.css";
import { useSettings } from "../contexts";

export default function ModelSettings() {
  const {
    settings,
    updateSettings,
    resolvedSettings,
    updateServer,
    activeServer,
    models,
    modelsLoading,
    modelsError,
    refetchModels,
  } = useSettings();

  const handleToggleDefault = (modelId: string) => {
    if (!activeServer) return;
    updateServer(activeServer.id, { defaultModel: modelId });
  };

  const handleToggleHidden = (modelId: string) => {
    if (!activeServer) return;
    const hidden = resolvedSettings.hiddenModels.includes(modelId);
    const next = hidden
      ? resolvedSettings.hiddenModels.filter((id) => id !== modelId)
      : [...resolvedSettings.hiddenModels, modelId];
    updateServer(activeServer.id, { hiddenModels: next });
    if (resolvedSettings.defaultModel === modelId) {
      updateServer(activeServer.id, { defaultModel: "" });
    }
  };

  const handleContextChange = (modelId: string, value: string) => {
    if (!activeServer) return;
    const num = parseInt(value);
    const next = { ...resolvedSettings.contextWindows };
    if (num > 0) {
      next[modelId] = num;
    } else {
      delete next[modelId];
    }
    updateServer(activeServer.id, { contextWindows: next });
  };

  const handleAliasChange = (modelId: string, value: string) => {
    if (!activeServer) return;
    const next = { ...resolvedSettings.modelAliases };
    if (value.trim()) {
      next[modelId] = value;
    } else {
      delete next[modelId];
    }
    updateServer(activeServer.id, { modelAliases: next });
  };

  return (
    <div>
      <div className={styles.header}>
        <Cpu size={20} />
        <h2>Models</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="systemPrompt">System Prompt</label>
          <textarea
            id="systemPrompt"
            className={styles.textarea}
            value={settings.systemPrompt}
            onChange={(e) => updateSettings({ systemPrompt: e.target.value })}
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
            onChange={(e) => updateSettings({ defaultContextWindow: parseInt(e.target.value) || 0 })}
            placeholder="131072"
            min={1024}
            step={1024}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="reasoningEffort">Default Reasoning Effort</label>
          <select
            id="reasoningEffort"
            className={styles.select}
            value={settings.reasoningEffort}
            onChange={(e) => updateSettings({ reasoningEffort: e.target.value as "none" | "low" | "medium" | "high" })}
          >
            <option value="none">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        <div className={styles.modelsSection}>
          <label>Models</label>

          {!resolvedSettings.serverUrl.trim() && (
            <div className={styles.modelsPrompt}>
              Enter a server URL in the Connections tab to discover available models.
            </div>
          )}

          {resolvedSettings.serverUrl.trim() && modelsLoading && (
            <div className={styles.modelsLoading}>Loading models...</div>
          )}

          {modelsError && (
            <div className={styles.modelsError}>
              <div className={styles.modelsErrorText}>{modelsError}</div>
              <button
                className={styles.retryButton}
                onClick={refetchModels}
                type="button"
              >
                Retry
              </button>
            </div>
          )}

          {models.length === 0 &&
            !modelsLoading &&
            !modelsError &&
            resolvedSettings.serverUrl.trim() && (
              <div className={styles.modelsEmpty}>
                No models available on this server.
              </div>
            )}

          {models.length > 0 && (
             <div className={styles.modelsList}>
              {models.map((model) => {
               const isDefault = model.id === resolvedSettings.defaultModel;
               const isHidden = resolvedSettings.hiddenModels.includes(model.id);
               const customContext = model.id in resolvedSettings.contextWindows;
               const contextValue = resolvedSettings.contextWindows[model.id] ?? "";
               const aliasValue = resolvedSettings.modelAliases[model.id] ?? "";

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
  );
}
