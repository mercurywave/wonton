import { ReactNode } from "react";
import { SettingsProvider } from "./SettingsContext";
import { ProjectsProvider } from "./ProjectsContext";
import { AgentsProvider } from "./AgentsContext";
import { FlowsProvider } from "./FlowsContext";
import { ToolsProvider } from "./ToolsContext";
import { ChatsProvider } from "./ChatsContext";
import { TasksProvider } from "./TasksContext";
import { BatchesProvider } from "./BatchesContext.tsx";
import { UIProvider } from "./UIContext";
import { NavProvider } from "./NavContext";
import { EventBusProvider } from "./EventBusContext";
import { ToastProvider } from "./ToastContext";
import { FeedbackProvider } from "./FeedbackContext";
import { NotificationsProvider } from "./NotificationsContext";

export { SettingsProvider, useSettings } from "./SettingsContext";
export { ProjectsProvider, useProjects } from "./ProjectsContext";
export { AgentsProvider, useAgentsContext } from "./AgentsContext";
export { FlowsProvider, useFlowsContext } from "./FlowsContext";
export { ToolsProvider, useToolsContext } from "./ToolsContext";
export { ChatsProvider, useChats } from "./ChatsContext";
export { TasksProvider, useTasks } from "./TasksContext";
export { BatchesProvider, useBatches } from "./BatchesContext.tsx";
export { UIProvider, useUI } from "./UIContext";
export { NavProvider, useNav } from "./NavContext";
export { EventBusProvider, useEventBus, emit, on } from "./EventBusContext";
export { FeedbackProvider, useFeedback, type FeedbackPayload } from "./FeedbackContext";
export { NotificationsProvider, useNotificationsContext } from "./NotificationsContext";
export { FilePermissionsProvider, useFilePermissions } from "./FilePermissionsContext";
export { ToastProvider, useToast, addToast, dismissToast, type ToastSeverity } from "./ToastContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <NotificationsProvider>
        <ProjectsProvider>
          <AgentsProvider>
            <NavProvider>
              <FlowsProvider>
                <ToolsProvider>
                  <EventBusProvider>
                    <ToastProvider>
                      <FeedbackProvider>
                        <ChatsProvider>
                          <TasksProvider>
                            <BatchesProvider>
                              <UIProvider>
                                {children}
                              </UIProvider>
                            </BatchesProvider>
                          </TasksProvider>
                        </ChatsProvider>
                      </FeedbackProvider>
                    </ToastProvider>
                  </EventBusProvider>
                </ToolsProvider>
              </FlowsProvider>
            </NavProvider>
          </AgentsProvider>
        </ProjectsProvider>
      </NotificationsProvider>
    </SettingsProvider>
  );
}
