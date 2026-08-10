import { Server } from "lucide-react";
import styles from "../components/ServerSettings.module.css";
import { useSettings } from "../contexts";

export default function ServerSettings() {
  const { resolvedSettings, updateServer, activeServer } = useSettings();

  if (!activeServer) {
    return (
      <div>
        <div className={styles.header}>
          <Server size={20} />
          <h2>Server</h2>
        </div>
        <p>No server configured. Go to the Servers tab to add one.</p>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.header}>
        <Server size={20} />
        <h2>Server — {activeServer.name}</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="serverUrl">Server URL</label>
          <input
            id="serverUrl"
            type="url"
            className={styles.input}
            value={resolvedSettings.serverUrl}
            onChange={(e) => updateServer(activeServer.id, { serverUrl: e.target.value })}
            placeholder="https://localhost"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="apiKey">API Key</label>
          <input
            id="apiKey"
            type="password"
            className={styles.input}
            value={resolvedSettings.apiKey}
            onChange={(e) => updateServer(activeServer.id, { apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </div>
      </div>
    </div>
  );
}
