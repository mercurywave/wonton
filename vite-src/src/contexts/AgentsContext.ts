import { createContext } from "react";
import { Agent, AgentToolPermissions } from "../types/chat";

export interface AgentsContextValue {
  customAgents: Agent[];
  allAgents: Agent[];
  mainAgents: Agent[];
  addAgent: (name: string, systemPrompt: string, toolPermissions?: AgentToolPermissions, folderOverride?: string, subagentAllowlist?: string[]) => Promise<void>;
  updateAgent: (id: string, name: string, systemPrompt: string, toolPermissions?: AgentToolPermissions, subagentAllowlist?: string[]) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
}

export const AgentsContext = createContext<AgentsContextValue | null>(null);
