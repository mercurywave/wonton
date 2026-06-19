import { useState, useCallback, useEffect } from "react";
import { useSettings } from "../contexts/SettingsContext";

export type NotificationBehavior = "always" | "unfocused" | "never";

export function useNotifications() {
  const [appHasFocus, setAppHasFocus] = useState(true);
  const { settings } = useSettings();

  useEffect(() => {
    const onFocus = () => setAppHasFocus(true);
    const onBlur = () => setAppHasFocus(false);

    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const showNotification = useCallback(
    async (title: string, body: string) => {
      const behavior = settings.notificationBehavior;
      if (behavior === "never") return;
      if (behavior === "unfocused" && appHasFocus) return;

      try {
        await window.electronAPI.notification.show(title, body, behavior);
      } catch {
        // silently ignore notification errors
      }
    },
    [appHasFocus, settings.notificationBehavior]
  );

  return { showNotification, appHasFocus };
}
