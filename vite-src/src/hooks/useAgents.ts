import { useState, useEffect, useCallback } from "react";
import { Agent } from "../types/chat";
import { agentStore } from "../store/agents";
import { BUILTIN_AGENTS } from "../utils/agents";

export async function loadAgentsFile(): Promise<Agent[]> {
  await agentStore.load();
  return agentStore.getCustomAgents();
}

export function getAllAgents(customAgents?: Agent[]): Agent[] {
  if (customAgents !== undefined) {
    return [...BUILTIN_AGENTS, ...customAgents];
  }
  return agentStore.getAllAgents();
}

export function getMainAgents(customAgents?: Agent[]): Agent[] {
  const all = getAllAgents(customAgents);
  return all.filter((a) => a.main);
}

export function getAgentById(agents: Agent[], id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function getAgentByName(agents: Agent[], name: string): Agent | undefined {
  return agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

export function useAgentsData() {
  const [customAgents, setCustomAgents] = useState<Agent[]>(() => agentStore.getCustomAgents());
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(() => {
    setCustomAgents(agentStore.getCustomAgents());
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await agentStore.load();
      if (!cancelled) {
        refresh();
        setIsLoading(false);
        setInitialized(true);
      }
    })();

    const unsubscribe = agentStore.subscribe(refresh);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const addAgent = useCallback(async (name: string, systemPrompt: string, defaultToolSet?: string[], folderOverride?: string, subagentAllowlist?: string[]) => {
    await agentStore.addAgent(name, systemPrompt, defaultToolSet, folderOverride, subagentAllowlist);
  }, []);

  const updateAgent = useCallback(async (id: string, name: string, systemPrompt: string, subagentAllowlist?: string[]) => {
    await agentStore.updateAgent(id, name, systemPrompt, subagentAllowlist);
  }, []);

  const deleteAgent = useCallback(async (id: string) => {
    await agentStore.deleteAgent(id);
  }, []);

  return {
    customAgents,
    isLoading,
    initialized,
    addAgent,
    updateAgent,
    deleteAgent,
  };
}
