import { ReactNode } from "react";
import { SettingsProvider } from "./SettingsContext";
import { ProjectsProvider } from "./ProjectsContext";
import { AgentsProvider } from "./AgentsContext";
import { FlowsProvider } from "./FlowsContext";
import { ChatsProvider } from "./ChatsContext";
import { TasksProvider } from "./TasksContext";
import { UIProvider } from "./UIContext";
import { NavProvider } from "./NavContext";
import { EventBusProvider } from "./EventBusContext";
import { FeedbackProvider } from "./FeedbackContext";
import { NotificationsProvider } from "./NotificationsContext";

export { SettingsProvider, useSettings } from "./SettingsContext";
export { ProjectsProvider, useProjects } from "./ProjectsContext";
export { AgentsProvider, useAgentsContext } from "./AgentsContext";
export { FlowsProvider, useFlowsContext } from "./FlowsContext";
export { ChatsProvider, useChats } from "./ChatsContext";
export { TasksProvider, useTasks } from "./TasksContext";
export { UIProvider, useUI } from "./UIContext";
export { NavProvider, useNav } from "./NavContext";
export { EventBusProvider, useEventBus, emit, on } from "./EventBusContext";
export { FeedbackProvider, useFeedback, type FeedbackPayload } from "./FeedbackContext";
export { NotificationsProvider, useNotificationsContext } from "./NotificationsContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <NotificationsProvider>
      <SettingsProvider>
        <ProjectsProvider>
          <AgentsProvider>
            <NavProvider>
              <FlowsProvider>
                <EventBusProvider>
                  <FeedbackProvider>
                    <ChatsProvider>
                      <TasksProvider>
                        <UIProvider>
                          {children}
                        </UIProvider>
                      </TasksProvider>
                    </ChatsProvider>
                  </FeedbackProvider>
                </EventBusProvider>
              </FlowsProvider>
            </NavProvider>
          </AgentsProvider>
        </ProjectsProvider>
      </SettingsProvider>
    </NotificationsProvider>
  );
}
