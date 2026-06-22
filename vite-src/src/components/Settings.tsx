import { useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import styles from "../components/Settings.module.css";
import ServerSettings from "../components/ServerSettings";
import ModelSettings from "../components/ModelSettings";
import PreferencesSettings from "../components/PreferencesSettings";
import AgentsSettings from "../components/AgentsSettings";

type Tab = "server" | "models" | "preferences" | "agents";

const tabs: { key: Tab; label: string }[] = [
  { key: "server", label: "Server" },
  { key: "models", label: "Models" },
  { key: "preferences", label: "Preferences" },
  { key: "agents", label: "Agents" },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<Tab>("server");

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
        </div>
      </div>
    </div>
  );
}
