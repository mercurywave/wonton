import { createContext, useContext, ReactNode } from "react";
import { useNotifications } from "../hooks/useNotifications";
import { NotificationBehavior } from "../hooks/useNotifications";

interface NotificationsContextValue {
  showNotification: (title: string, body: string, behavior: NotificationBehavior) => void;
  appHasFocus: boolean;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotifications();

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotificationsContext must be used within a NotificationsProvider");
  }
  return ctx;
}
