import { Agent } from "../types/chat";
import {
  AGENTS_FILE_NAME,
  isNeutralinoConnected,
  getRootDataDir,
} from "../utils/neuUtils";
import { BUILTIN_AGENTS } from "../utils/agents";
import { filesystem } from "@neutralinojs/lib";

type Listener = () => void;

interface AgentStore {
  getCustomAgents(): Agent[];
  load(): Promise<void>;
  addAgent(name: string, systemPrompt: string, defaultToolSet?: string[], folderOverride?: string, subagentAllowlist?: string[]): Promise<void>;
  updateAgent(id: string, name: string, systemPrompt: string, subagentAllowlist?: string[]): Promise<void>;
  deleteAgent(id: string): Promise<void>;
  getAllAgents(): Agent[];
  getMainAgents(): Agent[];
  subscribe(listener: Listener): () => void;
}

interface AgentStoreInternal extends AgentStore {
  _listeners: Set<Listener>;
}

const state = {
  customAgents: [] as Agent[],
  isLoaded: false,
};

function dispatch() {
  const listeners = agentStore._listeners;
  for (const listener of listeners) {
    listener();
  }
}

async function getFilePath(): Promise<string> {
  if (!isNeutralinoConnected()) return "";
  const rootDir = await getRootDataDir();
  return `${rootDir}/${AGENTS_FILE_NAME}`;
}

async function _save() {
  const filePath = await getFilePath();
  if (!filePath) return;
  try {
    await filesystem.writeFile(filePath, JSON.stringify(state.customAgents, null, 2));
  } catch (err) {
    console.error("agentStore: failed to save agents", err);
  }
}

const agentStore: AgentStoreInternal = {
  _listeners: new Set<Listener>(),

  getCustomAgents() {
    return state.customAgents;
  },

  async load() {
    if (state.isLoaded) return;

    if (!isNeutralinoConnected()) {
      state.customAgents = [];
      state.isLoaded = true;
      return;
    }

    const filePath = await getFilePath();
    if (!filePath) {
      state.customAgents = [];
      state.isLoaded = true;
      return;
    }

    try {
      const content = await filesystem.readFile(filePath);
      const parsed = JSON.parse(content) as Agent[];
      state.customAgents = Array.isArray(parsed) ? parsed : [];
    } catch {
      state.customAgents = [];
    }

    state.isLoaded = true;
  },

  async addAgent(name: string, systemPrompt: string, defaultToolSet?: string[], folderOverride?: string, subagentAllowlist?: string[]) {
    const newAgent: Agent = {
      id: `custom:${crypto.randomUUID()}`,
      name,
      systemPrompt,
      main: false,
      ...(defaultToolSet !== undefined && { defaultToolSet }),
      ...(folderOverride !== undefined && { folderOverride }),
      ...(subagentAllowlist !== undefined && { subagentAllowlist }),
    };
    state.customAgents = [...state.customAgents, newAgent];
    await _save();
    dispatch();
  },

  async updateAgent(id: string, name: string, systemPrompt: string, subagentAllowlist?: string[]) {
    const idx = state.customAgents.findIndex((a) => a.id === id);
    if (idx === -1) return;
    state.customAgents[idx] = {
      ...state.customAgents[idx],
      name,
      systemPrompt,
      ...(subagentAllowlist !== undefined && { subagentAllowlist }),
    };
    await _save();
    dispatch();
  },

  async deleteAgent(id: string) {
    state.customAgents = state.customAgents.filter((a) => a.id !== id);
    await _save();
    dispatch();
  },

  getAllAgents() {
    return [...BUILTIN_AGENTS, ...state.customAgents];
  },

  getMainAgents() {
    return this.getAllAgents().filter((a) => a.main);
  },

  subscribe(listener: Listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  },
};

export { agentStore };
