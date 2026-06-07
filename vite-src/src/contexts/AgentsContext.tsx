import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { Agent } from "../types/chat";
import { agentStore } from "../store/agents";
import { useAgentsData } from "../hooks/useAgents";

interface AgentsContextValue {
  customAgents: Agent[];
  allAgents: Agent[];
  mainAgents: Agent[];
  addAgent: (name: string, systemPrompt: string, defaultToolSet?: string[], folderOverride?: string, subagentAllowlist?: string[]) => Promise<void>;
  updateAgent: (id: string, name: string, systemPrompt: string, subagentAllowlist?: string[]) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const { customAgents, addAgent, updateAgent, deleteAgent } = useAgentsData();

  const allAgents = useMemo(() => agentStore.getAllAgents(), [customAgents]);
  const mainAgents = useMemo(() => agentStore.getMainAgents(), [customAgents]);

  const value = useMemo(
    () => ({
      customAgents,
      allAgents,
      mainAgents,
      addAgent,
      updateAgent,
      deleteAgent,
    }),
    [customAgents, allAgents, mainAgents, addAgent, updateAgent, deleteAgent]
  );

  return <AgentsContext.Provider value={value}>{children}</AgentsContext.Provider>;
}

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error("useAgentsContext must be used within an AgentsProvider");
  }
  return ctx;
}
