import { useState, useCallback } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
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

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");

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
    setEditingId(newId);
    setEditName("localhost");
    setEditUrl(defaultUrl);
  }, [addServer, setActiveServer]);

  const handleSelect = useCallback((server: ServerEntry) => {
    setActiveServer(server.id);
    setEditingId(null);
  }, [setActiveServer]);

  const handleDelete = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeServer(id);
    if (editingId === id) {
      setEditingId(null);
    }
  }, [removeServer, editingId]);

  const handleStartEdit = useCallback((server: ServerEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(server.id);
    setEditName(server.name);
    setEditUrl(server.serverUrl);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const trimmedName = editName.trim();
    const trimmedUrl = editUrl.trim();
    if (!trimmedName || !trimmedUrl) return;
    updateServer(editingId, { name: trimmedName, serverUrl: trimmedUrl });
    setEditingId(null);
  }, [editingId, editName, editUrl, updateServer]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }, [handleSaveEdit]);

  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingId(null);
    }
  }, [handleSaveEdit]);

  return (
    <div>
      <div className={styles.header}>
        <h2>Servers</h2>
      </div>

      <div className={styles.serverList}>
        {servers.map((server) => (
          <div
            key={server.id}
            className={`${styles.serverItem} ${server.id === activeServer?.id ? styles.active : ""}`}
            onClick={() => handleSelect(server)}
          >
            {editingId === server.id ? (
              <div className={styles.editRow}>
                <input
                  className={styles.nameEditInput}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  placeholder="Server name"
                  autoFocus
                />
                <input
                  className={styles.urlEditInput}
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  onKeyDown={handleUrlKeyDown}
                  placeholder="https://localhost"
                />
              </div>
            ) : (
              <>
                <span className={styles.serverItemName}>{server.name}</span>
                <span className={styles.serverItemUrl}>{server.serverUrl}</span>
                <div className={styles.serverItemActions}>
                  <button onClick={(e) => handleStartEdit(server, e)} title="Edit">
                    <Pencil size={14} />
                  </button>
                  {servers.length > 1 && (
                    <button
                      className={styles.deleteBtn}
                      onClick={(e) => handleDelete(server.id, e)}
                      title="Remove server"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <button className={styles.addButton} onClick={handleAdd} type="button">
        <Plus size={16} />
        Add Server
      </button>
    </div>
  );
}
