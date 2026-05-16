import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { useAgents } from "../hooks/useAgents";
import { Agent } from "../types/chat";

interface AgentsContextValue {
  customAgents: Agent[];
  allAgents: Agent[];
  addAgent: (agent: Omit<Agent, "id">) => Promise<void>;
  updateAgent: (id: string, name: string, systemPrompt: string) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

const AgentsContext = createContext<AgentsContextValue | null>(null);

export function AgentsProvider({ children }: { children: ReactNode }) {
  const [customAgents, addAgent, updateAgent, deleteAgent] = useAgents();
  const [allAgents, setAllAgents] = useState<Agent[]>([]);

  useEffect(() => {
    import("../hooks/useAgents").then(({ loadAgentsFile, getAllAgents }) => {
      loadAgentsFile().then((custom) => {
        setAllAgents(getAllAgents(custom));
      });
    });
  }, []);

  const value = useMemo(
    () => ({
      customAgents,
      allAgents,
      addAgent,
      updateAgent,
      deleteAgent,
    }),
    [customAgents, allAgents, addAgent, updateAgent, deleteAgent]
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
