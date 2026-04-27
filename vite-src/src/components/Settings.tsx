import { Settings as SettingsIcon } from "lucide-react";
import styles from "../components/Settings.module.css";
import { ChatSettings as ChatSettingsType } from "../hooks/useChatSettings";

interface SettingsProps {
  settings: ChatSettingsType;
  onUpdate: (updates: Partial<ChatSettingsType>) => void;
}

export default function Settings({ settings, onUpdate }: SettingsProps) {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <SettingsIcon size={20} />
        <h2>Settings</h2>
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
            placeholder="https://api.openai.com"
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

        <div className={styles.field}>
          <label htmlFor="model">Model</label>
          <input
            id="model"
            type="text"
            className={styles.input}
            value={settings.model}
            onChange={(e) => onUpdate({ model: e.target.value })}
            placeholder="gpt-3.5-turbo"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="systemPrompt">System Prompt</label>
          <textarea
            id="systemPrompt"
            className={styles.textarea}
            value={settings.systemPrompt}
            onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
            placeholder="You are a helpful assistant."
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}
