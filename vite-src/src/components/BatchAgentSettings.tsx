import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Server, Clock3 } from "lucide-react";
import styles from "./BatchAgentSettings.module.css";
import { useSettings } from "../contexts";
import { useServerModels } from "../hooks/useServerModels";
import { getErrorMessage, PorkbunClient, resolvePorkbunBaseUrl } from "../utils/porkbunApi";

function utcTimeToLocalTime(value: number | undefined, fallbackHour: number): string {
  const utcMinutes = (Number.isFinite(value) ? Number(value) : fallbackHour) * 60;
  const localMinutes = (utcMinutes - new Date().getTimezoneOffset() + 24 * 60 * 60) % (24 * 60);
  const hours = Math.trunc(localMinutes / 60) % 24;
  const minutes = localMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function localTimeToUtcHour(value: string, fallbackHour: number): number {
  const [rawHour, rawMinute = "0"] = value.split(":");
  const hour = Number.parseInt(rawHour ?? String(fallbackHour), 10);
  const minute = Number.parseInt(rawMinute, 10);
  const localMinutes = ((Number.isFinite(hour) ? hour : fallbackHour) * 60) + (Number.isFinite(minute) ? minute : 0);
  const utcMinutes = (localMinutes + new Date().getTimezoneOffset() + 24 * 60 * 60) % (24 * 60);

  return Math.trunc(utcMinutes / 60) % 24;
}

export default function BatchAgentSettings() {
  const { settings, updateSettings, servers } = useSettings();

  const enabled = Boolean(settings.porkbunServerUrl?.trim());
  const [queueStart, setQueueStart] = useState("09:00");
  const [queueEnd, setQueueEnd] = useState("17:00");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const queueStartRef = useRef<HTMLInputElement | null>(null);
  const queueEndRef = useRef<HTMLInputElement | null>(null);
  const saveQueueTimerRef = useRef<number | null>(null);

  const client = useMemo(() => {
    const baseUrl = resolvePorkbunBaseUrl(settings.porkbunServerUrl);
    return baseUrl ? new PorkbunClient({ baseUrl, apiKey: settings.porkbunApiKey || undefined }) : null;
  }, [settings.porkbunApiKey, settings.porkbunServerUrl]);

  useEffect(() => {
    if (!client) {
      setQueueStart("09:00");
      setQueueEnd("17:00");
      setQueueError(null);
      return;
    }

    let cancelled = false;
    const loadQueueConfig = async () => {
      try {
        setQueueLoading(true);
        setQueueError(null);
        const config = await client.fetchQueueConfig();
        if (cancelled) return;
        setQueueStart(utcTimeToLocalTime(config.start_hour, 9));
        setQueueEnd(utcTimeToLocalTime(config.end_hour, 17));
      } catch (err) {
        if (cancelled) return;
        setQueueError(getErrorMessage(err, "Unable to load queue window."));
      } finally {
        if (!cancelled) {
          setQueueLoading(false);
        }
      }
    };

    void loadQueueConfig();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const applyQueueConfig = async (nextStart: string, nextEnd: string) => {
    if (!client) return;

    const startHour = localTimeToUtcHour(nextStart, 9);
    const endHour = localTimeToUtcHour(nextEnd, 17);

    try {
      setQueueLoading(true);
      setQueueError(null);
      await client.updateQueueConfig({
        startHour: Number.isFinite(startHour) ? startHour : 9,
        endHour: Number.isFinite(endHour) ? endHour : 17,
      });
      const config = await client.fetchQueueConfig();
      setQueueStart(utcTimeToLocalTime(config.start_hour, 9));
      setQueueEnd(utcTimeToLocalTime(config.end_hour, 17));
    } catch (err) {
      setQueueError(getErrorMessage(err, "Unable to update queue window."));
    } finally {
      setQueueLoading(false);
    }
  };

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

  const queueWindow = useMemo(() => `${queueStart} - ${queueEnd}`, [queueEnd, queueStart]);
  const queueInputsDisabled = !enabled || !client || queueLoading || Boolean(queueError);

  const scheduleQueueSave = useCallback(() => {
    if (!client) return;

    if (saveQueueTimerRef.current !== null) {
      window.clearTimeout(saveQueueTimerRef.current);
    }

    saveQueueTimerRef.current = window.setTimeout(() => {
      const startFocused = document.activeElement === queueStartRef.current;
      const endFocused = document.activeElement === queueEndRef.current;
      if (startFocused || endFocused) {
        scheduleQueueSave();
        return;
      }

      void applyQueueConfig(queueStart, queueEnd);
    }, 2000);
  }, [applyQueueConfig, client, queueEnd, queueStart]);

  useEffect(() => {
    return () => {
      if (saveQueueTimerRef.current !== null) {
        window.clearTimeout(saveQueueTimerRef.current);
      }
    };
  }, []);

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

        <div className={styles.queueWindowRow}>
          <div className={styles.field}>
            <label htmlFor="porkbunQueueWindowStart">Queue Active Window Start</label>
            <input
              ref={queueStartRef}
              id="porkbunQueueWindowStart"
              className={styles.input}
              type="time"
              value={queueStart}
              disabled={queueInputsDisabled}
              onFocus={() => {
                if (saveQueueTimerRef.current !== null) {
                  window.clearTimeout(saveQueueTimerRef.current);
                  saveQueueTimerRef.current = null;
                }
              }}
              onChange={(e) => {
                setQueueStart(e.target.value);
              }}
              onBlur={() => {
                scheduleQueueSave();
              }}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="porkbunQueueWindowEnd">Queue Active Window End</label>
            <input
              ref={queueEndRef}
              id="porkbunQueueWindowEnd"
              className={styles.input}
              type="time"
              value={queueEnd}
              disabled={queueInputsDisabled}
              onFocus={() => {
                if (saveQueueTimerRef.current !== null) {
                  window.clearTimeout(saveQueueTimerRef.current);
                  saveQueueTimerRef.current = null;
                }
              }}
              onChange={(e) => {
                setQueueEnd(e.target.value);
              }}
              onBlur={() => {
                scheduleQueueSave();
              }}
            />
          </div>
        </div>

        <div className={styles.subtleBox}>
          <Clock3 size={16} />
          <span>
            {enabled
              ? queueError
                ? `Queue settings are read-only because Porkbun is unavailable: ${queueError}`
                : `Porkbun is enabled. Queue window: ${queueWindow}`
              : "Porkbun is not configured yet."}
          </span>
        </div>
      </div>
    </div>
  );
}
