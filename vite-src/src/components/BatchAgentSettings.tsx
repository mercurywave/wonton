import { useMemo } from "react";
import { Server, Clock3 } from "lucide-react";
import styles from "./BatchAgentSettings.module.css";
import { useSettings } from "../contexts";

export default function BatchAgentSettings() {
  const { settings, updateSettings } = useSettings();

  const enabled = Boolean(settings.porkbunServerUrl?.trim());

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
            placeholder="http://localhost:8000"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunLlmServerId">LLM Server Selection</label>
          <input
            id="porkbunLlmServerId"
            className={styles.input}
            type="text"
            value={settings.porkbunLlmServerId}
            onChange={(e) => updateSettings({ porkbunLlmServerId: e.target.value })}
            placeholder="server id or name"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="porkbunModelId">Model</label>
          <input
            id="porkbunModelId"
            className={styles.input}
            type="text"
            value={settings.porkbunModelId}
            onChange={(e) => updateSettings({ porkbunModelId: e.target.value })}
            placeholder="gpt-4o-mini"
          />
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

        <div className={styles.checkboxField}>
          <label htmlFor="porkbunAutoActivate">Auto-activate queue when focused</label>
          <input
            id="porkbunAutoActivate"
            className={styles.checkboxInput}
            type="checkbox"
            checked={settings.porkbunAutoActivate}
            onChange={(e) => updateSettings({ porkbunAutoActivate: e.target.checked })}
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
