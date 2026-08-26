import { useCallback } from "react";
import { Plus, Server, Star, Trash2 } from "lucide-react";
import styles from "../components/ServerListSettings.module.css";
import { useSettings } from "../contexts";
import type { ServerEntry } from "../types/server";

export default function ServerListSettings() {
  const {
    servers,
    activeServer,
    updateServer,
    removeServer,
    setActiveServer,
    addServer,
  } = useSettings();

  const handleAdd = useCallback(() => {
    const defaultUrl = "https://localhost";
    const newId = addServer({
      name: "localhost",
      serverUrl: defaultUrl,
      apiKey: "",
      defaultModel: "",
      contextWindows: {},
      modelAliases: {},
      hiddenModels: [],
    });
    setActiveServer(newId);
  }, [addServer, setActiveServer]);

  const handleFieldChange = useCallback(
    (serverId: string, field: "name" | "serverUrl" | "apiKey", value: string) => {
      updateServer(serverId, { [field]: value } as Partial<ServerEntry>);
    },
    [updateServer]
  );

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeServer(id);
  }, [removeServer]);

  return (
    <div>
      <div className={styles.header}>
        <Server size={20} />
        <h2>Connections</h2>
      </div>

      <div className={styles.serverList}>
        {servers.map((server) => {
          const isPrimary = server.id === activeServer?.id;

          return (
            <div
              key={server.id}
              className={`${styles.serverCard} ${isPrimary ? styles.serverCardPrimary : ""}`}
              onClick={() => setActiveServer(server.id)}
            >
              <div className={styles.serverCardHeader}>
                <div className={styles.serverNameWrap}>
                  <span className={styles.serverLabel}>Name</span>
                  <input
                    className={styles.nameInput}
                    value={server.name}
                    onChange={(e) => handleFieldChange(server.id, "name", e.target.value)}
                    placeholder="Connection name"
                  />
                </div>

                <div className={styles.serverCardActions}>
                  <button
                    type="button"
                    className={`${styles.primaryButton} ${isPrimary ? styles.primaryButtonActive : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveServer(server.id);
                    }}
                    title={isPrimary ? "Primary connection" : "Set as primary connection"}
                  >
                    <Star size={14} />
                    <span>{isPrimary ? "Primary" : "Set primary"}</span>
                  </button>

                  {servers.length > 1 && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(server.id, e)}
                      title="Remove connection"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.serverFieldGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor={`server-url-${server.id}`}>Server URL</label>
                  <input
                    id={`server-url-${server.id}`}
                    className={styles.input}
                    type="url"
                    value={server.serverUrl}
                    onChange={(e) => handleFieldChange(server.id, "serverUrl", e.target.value)}
                    placeholder="https://localhost"
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor={`server-api-${server.id}`}>API Key</label>
                  <input
                    id={`server-api-${server.id}`}
                    className={styles.input}
                    type="password"
                    value={server.apiKey}
                    onChange={(e) => handleFieldChange(server.id, "apiKey", e.target.value)}
                    placeholder="sk-..."
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button className={styles.addButton} onClick={handleAdd} type="button">
        <Plus size={16} />
        Add Connection
      </button>
    </div>
  );
}
