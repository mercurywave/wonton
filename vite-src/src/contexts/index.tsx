import { ReactNode } from "react";
import { SettingsProvider } from "./SettingsContext";
import { ProjectsProvider } from "./ProjectsContext";
import { AgentsProvider } from "./AgentsContext";
import { FlowsProvider } from "./FlowsContext";
import { ChatsProvider } from "./ChatsContext";
import { UIProvider } from "./UIContext";
import { NavProvider } from "./NavContext";
import { EventBusProvider } from "./EventBusContext";

export { SettingsProvider, useSettings } from "./SettingsContext";
export { ProjectsProvider, useProjects } from "./ProjectsContext";
export { AgentsProvider, useAgentsContext } from "./AgentsContext";
export { FlowsProvider, useFlowsContext } from "./FlowsContext";
export { ChatsProvider, useChats } from "./ChatsContext";
export { UIProvider, useUI } from "./UIContext";
export { NavProvider, useNav } from "./NavContext";
export { EventBusProvider, useEventBus } from "./EventBusContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ProjectsProvider>
        <AgentsProvider>
          <NavProvider>
            <FlowsProvider>
              <EventBusProvider>
                <ChatsProvider>
                  <UIProvider>
                    {children}
                  </UIProvider>
                </ChatsProvider>
              </EventBusProvider>
            </FlowsProvider>
          </NavProvider>
        </AgentsProvider>
      </ProjectsProvider>
    </SettingsProvider>
  );
}
