import { useMemo, ReactNode } from "react";
import { AgentsContext } from "./AgentsContext.ts";
import { agentStore } from "../store/agents";
import { useAgentsData } from "../hooks/useAgents";

export function AgentsProvider({ children }: { children: ReactNode }) {
  const { customAgents, addAgent, updateAgent, deleteAgent } = useAgentsData();

  const allAgents = useMemo(() => agentStore.getAllAgents(), []);
  const mainAgents = useMemo(() => agentStore.getMainAgents(), []);

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


