import { Server } from "lucide-react";
import styles from "../components/ServerSettings.module.css";
import { useSettings } from "../contexts";

export default function ServerSettings() {
  const { settings, updateSettings } = useSettings();
  const onUpdate = updateSettings;

  return (
    <div>
      <div className={styles.header}>
        <Server size={20} />
        <h2>Server</h2>
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
            placeholder="https://localhost"
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
      </div>
    </div>
  );
}
