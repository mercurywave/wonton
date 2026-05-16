import { ReactNode } from "react";
import { SettingsProvider } from "./SettingsContext";
import { ProjectsProvider } from "./ProjectsContext";
import { AgentsProvider } from "./AgentsContext";
import { ChatsProvider } from "./ChatsContext";
import { UIProvider } from "./UIContext";

export { SettingsProvider, useSettings } from "./SettingsContext";
export { ProjectsProvider, useProjects } from "./ProjectsContext";
export { AgentsProvider, useAgentsContext } from "./AgentsContext";
export { ChatsProvider, useChats } from "./ChatsContext";
export { UIProvider, useUI } from "./UIContext";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <ProjectsProvider>
        <AgentsProvider>
          <ChatsProvider>
            <UIProvider>
              {children}
            </UIProvider>
          </ChatsProvider>
        </AgentsProvider>
      </ProjectsProvider>
    </SettingsProvider>
  );
}
