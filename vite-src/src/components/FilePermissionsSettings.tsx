import { useState, useCallback, useEffect } from "react";
import { Folder, FolderOpen, Shield } from "lucide-react";
import { FilePermission } from "../types/chat";
import { isBackendConnected } from "../utils/platformUtils";
import FileTree from "../components/FileTree";
import styles from "../components/FilePermissionsSettings.module.css";

interface FilePermissionsSettingsProps {
  folderPath: string;
  onFolderChange: (path: string) => void;
  permissions: Record<string, FilePermission> | undefined;
  setPermission: (relativePath: string, permission: FilePermission) => void;
  isLoading: boolean;
}

export default function FilePermissionsSettings({
  folderPath,
  onFolderChange,
  permissions,
  setPermission,
  isLoading,
}: FilePermissionsSettingsProps) {
  const [localFolderPath, setLocalFolderPath] = useState(folderPath || "");

  useEffect(() => {
    setLocalFolderPath(folderPath || "");
  }, [folderPath]);

  const handleSelectFolder = useCallback(async () => {
    if (!isBackendConnected()) return;
    try {
      const result = await window.electronAPI.os.showFolderDialog("Select Project Folder");
      if (result) {
        setLocalFolderPath(result);
        onFolderChange(result);
      }
    } catch (err) {
      console.error("handleSelectFolder: failed to show folder dialog", err);
    }
  }, [onFolderChange]);

  const handleOpenFolder = useCallback(async () => {
    if (!isBackendConnected() || !localFolderPath) return;
    try {
      await window.electronAPI.os.open(localFolderPath);
    } catch (err) {
      console.error("handleOpenFolder: failed to open folder", err);
    }
  }, [localFolderPath]);

  const handlePermissionChange = useCallback(
    (nodePath: string, permission: FilePermission) => {
      const normFolderPath = localFolderPath.replace(/\\/g, "/");
      const normNodePath = nodePath.replace(/\\/g, "/");
      let relPath = "";
      if (normNodePath.startsWith(normFolderPath + "/")) {
        relPath = normNodePath.slice(normFolderPath.length + 1);
      }
      setPermission(relPath, permission);
    },
    [localFolderPath, setPermission]
  );

  if (!localFolderPath) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <Shield size={20} />
            <h2>File Permissions</h2>
          </div>

          <div className={styles.linkPrompt}>
            <Folder size={24} />
            <p>Link a project folder to manage file permissions.</p>
            <button className={styles.linkButton} onClick={handleSelectFolder}>
              <FolderOpen size={16} />
              Select Folder
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Shield size={20} />
          <h2>File Permissions</h2>
        </div>

        <div className={styles.folderSection}>
          <div className={styles.folderRow}>
            <Folder size={16} />
            <span className={styles.folderLabel}>{localFolderPath}</span>
            <button className={styles.folderAction} onClick={handleOpenFolder}>
              <FolderOpen size={14} />
              Open
            </button>
            <button className={styles.folderAction} onClick={handleSelectFolder}>
              Change
            </button>
          </div>
        </div>

        <div className={styles.treeSection}>
          <FileTree
            folderPath={localFolderPath}
            permissions={permissions}
            onPermissionChange={handlePermissionChange}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
