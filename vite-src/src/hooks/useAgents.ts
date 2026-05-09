import { useState, useCallback } from "react";
import { Agent } from "../types/chat";
import {
  AGENTS_FILE_NAME,
  isNeutralinoConnected,
  getRootDataDir,
} from "../utils/neuUtils";
import { BUILTIN_AGENTS } from "../utils/agents";
import { filesystem } from "@neutralinojs/lib";

const STORAGE_KEY = "wonton_agents";

function loadCachedAgents(): Agent[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveCachedAgents(agents: Agent[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(agents));
  } catch {
    // ignore
  }
}

export async function loadAgentsFile(): Promise<Agent[]> {
  if (!isNeutralinoConnected()) {
    return loadCachedAgents();
  }

  const rootDir = await getRootDataDir();
  const agentsPath = `${rootDir}/${AGENTS_FILE_NAME}`;

  try {
    const content = await filesystem.readFile(agentsPath);
    const parsed = JSON.parse(content) as Agent[];
    saveCachedAgents(parsed);
    return parsed;
  } catch {
    // File doesn't exist or error reading
    return loadCachedAgents();
  }
}

export async function saveAgentsFile(agents: Agent[]): Promise<void> {
  if (!isNeutralinoConnected()) {
    saveCachedAgents(agents);
    return;
  }

  const rootDir = await getRootDataDir();
  const agentsPath = `${rootDir}/${AGENTS_FILE_NAME}`;

  // Ensure root data directory exists
  try {
    await filesystem.writeFile(agentsPath, JSON.stringify(agents, null, 2));
    saveCachedAgents(agents);
  } catch (err) {
    console.error("saveAgentsFile: failed to write agents.json", err);
  }
}

export function getAllAgents(customAgents: Agent[]): Agent[] {
  return [...BUILTIN_AGENTS, ...customAgents];
}

export function getMainAgents(customAgents: Agent[]): Agent[] {
  return getAllAgents(customAgents).filter((a) => a.main);
}

export function useAgents(): [
  Agent[],
  (agent: Omit<Agent, "id">) => Promise<void>,
  (id: string) => Promise<void>,
] {
  const [agents, setAgents] = useState<Agent[]>(() => {
    const cached = loadCachedAgents();
    return cached;
  });

  const addAgent = useCallback(async (agent: Omit<Agent, "id">) => {
    const newAgent: Agent = {
      ...agent,
      id: `custom:${crypto.randomUUID()}`,
    };
    const next = [...agents, newAgent];
    setAgents(next);
    await saveAgentsFile(next);
  }, [agents]);

  const deleteAgent = useCallback(async (id: string) => {
    const next = agents.filter((a) => a.id !== id);
    setAgents(next);
    await saveAgentsFile(next);
  }, [agents]);

  return [agents, addAgent, deleteAgent];
}
