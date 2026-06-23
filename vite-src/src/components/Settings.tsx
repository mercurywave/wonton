import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import styles from "../components/Settings.module.css";
import ServerSettings from "../components/ServerSettings";
import ModelSettings from "../components/ModelSettings";
import PreferencesSettings from "../components/PreferencesSettings";
import AgentsSettings from "../components/AgentsSettings";
import FilePermissionsSettings from "../components/FilePermissionsSettings";
import { useFilePermissions, useProjects, useNav } from "../contexts";

type Tab = "server" | "models" | "preferences" | "agents" | "permissions";

interface SettingsProps {
  onFolderChange?: (id: string) => void;
}

const tabs: { key: Tab; label: string }[] = [
  { key: "server", label: "Server" },
  { key: "models", label: "Models" },
  { key: "preferences", label: "Preferences" },
  { key: "agents", label: "Agents" },
  { key: "permissions", label: "Permissions" },
];

export default function Settings({ onFolderChange }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<Tab>("server");
  const { projects } = useProjects();
  const { activeProjectId } = useNav();
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const folderPath = activeProject?.folderPath || "";

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <SettingsIcon size={20} />
          <h2>Settings</h2>
        </div>

        <div className={styles.tabs}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.tabContent}>
          {activeTab === "server" && <ServerSettings />}
          {activeTab === "models" && <ModelSettings />}
          {activeTab === "preferences" && <PreferencesSettings />}
          {activeTab === "agents" && <AgentsSettings />}
          {activeTab === "permissions" && (
            <FilePermissionsTab
              folderPath={folderPath}
              projectId={activeProjectId}
              onFolderChange={onFolderChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilePermissionsTab({
  folderPath,
  projectId,
  onFolderChange,
}: {
  folderPath: string;
  projectId: string | null;
  onFolderChange?: (id: string) => void;
}) {
  const { permissions, setPermission, isLoading } = useFilePermissions();

  return (
    <FilePermissionsSettings
      folderPath={folderPath}
      onFolderChange={() => {
        if (onFolderChange && projectId) onFolderChange(projectId);
      }}
      permissions={permissions}
      setPermission={setPermission}
      isLoading={isLoading}
    />
  );
}
