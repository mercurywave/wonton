import { Bell } from "lucide-react";
import styles from "../components/PreferencesSettings.module.css";
import { useSettings } from "../contexts";

export default function PreferencesSettings() {
  const { settings, updateSettings } = useSettings();
  const onUpdate = updateSettings;

  return (
    <div>
      <div className={styles.header}>
        <Bell size={20} />
        <h2>Preferences</h2>
      </div>

      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="notificationBehavior">Notification Behavior</label>
          <select
            id="notificationBehavior"
            className={styles.select}
            value={settings.notificationBehavior}
            onChange={(e) => onUpdate({ notificationBehavior: e.target.value as "always" | "unfocused" | "never" })}
          >
            <option value="always">Always notify</option>
            <option value="unfocused">Only when app is unfocused</option>
            <option value="never">Never</option>
          </select>
        </div>
      </div>
    </div>
  );
}
