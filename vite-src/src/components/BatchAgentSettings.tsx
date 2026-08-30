import { useMemo } from "react";
import { Server, Clock3 } from "lucide-react";
import styles from "./BatchAgentSettings.module.css";
import { useSettings } from "../contexts";
import { useServerModels } from "../hooks/useServerModels";

export default function BatchAgentSettings() {
  const { settings, updateSettings, servers } = useSettings();

  const enabled = Boolean(settings.porkbunServerUrl?.trim());

  const selectedLlmServer = useMemo(
    () => servers.find(
      (server) =>
        server.id === settings.porkbunLlmServerId ||
        server.serverUrl === settings.porkbunLlmServerId
    ),
    [servers, settings.porkbunLlmServerId]
  );

  const { models, isLoading, error: modelsError } = useServerModels(
    selectedLlmServer?.serverUrl ?? "",
    selectedLlmServer?.apiKey ?? ""
  );

  const modelOptions = useMemo(
    () => [...models].sort((a, b) => a.id.localeCompare(b.id)),
    [models]
  );

  const visibleModelOptions = useMemo(() => {
    if (!settings.porkbunModelId?.trim()) {
      return modelOptions;
    }

    if (modelOptions.some((model) => model.id === settings.porkbunModelId)) {
      return modelOptions;
    }

    return [{ id: settings.porkbunModelId }, ...modelOptions];
  }, [modelOptions, settings.porkbunModelId]);

  const hasSavedModel = Boolean(settings.porkbunModelId?.trim());
  const modelValue = hasSavedModel ? settings.porkbunModelId : "";
  const isModelSelectDisabled = !selectedLlmServer || isLoading || Boolean(modelsError) || modelOptions.length === 0;

  const maskedLlmApiKey = useMemo(() => {
    const value = selectedLlmServer?.apiKey || settings.porkbunApiKey || "";
    return value ? "*".repeat(Math.max(value.length, 4)) : "none";
  }, [selectedLlmServer?.apiKey, settings.porkbunApiKey]);

  const queueWindow = useMemo(() => {
    const start = settings.porkbunQueueWindowStart || "09:00";
    const end = settings.porkbunQueueWindowEnd || "17:00";
    return `${start} - ${end}`;
  }, [settings.porkbunQueueWindowStart, settings.porkbunQueueWindowEnd]);

  return (
    <div>
      <div className={styles.header}>
        <Server size={20} />
        <h2>Batch Agent</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="porkbunServerUrl">Porkbun Server URL</label>
          <input
            id="porkbunServerUrl"
            className={styles.input}
            type="url"
            value={settings.porkbunServerUrl}
            onChange={(e) => updateSettings({ porkbunServerUrl: e.target.value })}
            placeholder="https://porkbun.example.com"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunLlmServerId">LLM Server Selection</label>
          <select
            id="porkbunLlmServerId"
            className={styles.input}
            value={selectedLlmServer?.id ?? ""}
            onChange={(e) => {
              const nextServer = servers.find((server) => server.id === e.target.value);
              if (!nextServer) {
                updateSettings({ porkbunLlmServerId: "", porkbunApiKey: "", porkbunModelId: "" });
                return;
              }
              updateSettings({
                porkbunLlmServerId: nextServer.serverUrl,
                porkbunApiKey: nextServer.apiKey,
                porkbunModelId: "",
              });
            }}
          >
            <option value="">Select an LLM connection</option>
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name || "Connection"}
              </option>
            ))}
          </select>

          <div className={styles.detailsBox}>
            <div className={styles.detailsRow}>
              <span className={styles.detailsLabel}>URL</span>
              <span>{selectedLlmServer?.serverUrl || settings.porkbunLlmServerId || "Not selected"}</span>
            </div>
            <div className={styles.detailsRow}>
              <span className={styles.detailsLabel}>API key</span>
              <span>{maskedLlmApiKey}</span>
            </div>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunModelId">Model</label>
          <select
            id="porkbunModelId"
            className={styles.input}
            value={modelValue}
            onChange={(e) => updateSettings({ porkbunModelId: e.target.value })}
            disabled={isModelSelectDisabled}
          >
            {selectedLlmServer ? (
              isLoading ? (
                <>
                  {hasSavedModel && <option value={settings.porkbunModelId}>{settings.porkbunModelId}</option>}
                  <option value="">Loading models...</option>
                </>
              ) : modelsError ? (
                <>
                  {hasSavedModel && <option value={settings.porkbunModelId}>{settings.porkbunModelId}</option>}
                  <option value="">Server unreachable</option>
                </>
              ) : modelOptions.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                <option value="">Select a model</option>
              )
            ) : (
              <option value="">Select an LLM connection</option>
            )}
            {visibleModelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunQueueWindowStart">Queue Active Window Start</label>
          <input
            id="porkbunQueueWindowStart"
            className={styles.input}
            type="time"
            value={settings.porkbunQueueWindowStart}
            onChange={(e) => updateSettings({ porkbunQueueWindowStart: e.target.value })}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunQueueWindowEnd">Queue Active Window End</label>
          <input
            id="porkbunQueueWindowEnd"
            className={styles.input}
            type="time"
            value={settings.porkbunQueueWindowEnd}
            onChange={(e) => updateSettings({ porkbunQueueWindowEnd: e.target.value })}
          />
        </div>

        <div className={styles.subtleBox}>
          <Clock3 size={16} />
          <span>
            {enabled ? `Porkbun is enabled. Queue window: ${queueWindow}` : "Porkbun is not configured yet."}
          </span>
        </div>
      </div>
    </div>
  );
}
