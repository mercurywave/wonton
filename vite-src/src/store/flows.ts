import { Flow } from "../types/chat";
import {
  FLOWS_DIR_NAME,
  isBackendConnected,
  getRootDataDir,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";
import { parse as yamlParse } from "yaml";

const FLOW_EXT = ".yaml";

interface LoadResult {
  flows: Flow[];
  flowsPath: string;
  conflictIds: string[];
  conflictFiles: Record<string, string>;
}

type Listener = () => void;

interface FlowStore {
  getFlows(): Flow[];
  getFlowsPath(): string;
  getConflictIds(): string[];
  getConflictFiles(): Record<string, string>;
  load(): Promise<void>;
  refresh(): Promise<void>;
  subscribe(listener: Listener): () => void;
}

interface FlowStoreInternal extends FlowStore {
  _listeners: Set<Listener>;
  isLoaded: boolean;
}

const state = {
  flows: [] as Flow[],
  flowsPath: "",
  conflictIds: [] as string[],
  conflictFiles: {} as Record<string, string>,
  isLoaded: false,
};

function dispatch() {
  const listeners = flowStore._listeners;
  for (const listener of listeners) {
    listener();
  }
}

async function loadFlowsFromDisk(): Promise<LoadResult> {
  if (!isBackendConnected()) {
    return { flows: [...state.flows], flowsPath: "", conflictIds: [], conflictFiles: {} };
  }

  const rootDir = await getRootDataDir();
  const flowsDir = `${rootDir}/${FLOWS_DIR_NAME}`;

  let entries: { entry: string }[] = [];
  try {
    entries = await filesystem.readDirectory(flowsDir);
  } catch {
    return { flows: [...state.flows], flowsPath: flowsDir, conflictIds: [], conflictFiles: {} };
  }

  const flows: Flow[] = [];
  const flowSources = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.entry;
    if (!name.endsWith(FLOW_EXT)) continue;

    const filePath = `${flowsDir}/${name}`;

    try {
      const content = await filesystem.readFile(filePath);
      const data = yamlParse(content)! as Record<string, unknown>;
      if (!data.id) throw new Error("id is required");
      if (!data.name) throw new Error("name is required");
      if (typeof data.command === "string") {
        data.isCommand = true;
      }
      flows.push(data as any);
      flowSources.set(data.id as string, name);
    } catch (e) {
      console.warn(`loadFlowsFromDisk: failed to parse ${name}:`, e);
    }
  }

  const seen = new Map<string, Flow>();
  const conflictIds = new Set<string>();
  const conflictFiles: Record<string, string> = {};
  for (const flow of flows) {
    const id = flow.id;
    if (seen.has(id)) {
      conflictIds.add(id);
      const currentFile = flowSources.get(id) ?? "unknown";
      conflictFiles[id] = currentFile;
      console.error(`loadFlowsFromDisk: conflicting workflow id "${id}" in "${currentFile}" — skipping duplicate.`);
    }
    seen.set(id, flow);
  }
  const deduped = Array.from(seen.values());

  return { flows: deduped, flowsPath: flowsDir, conflictIds: Array.from(conflictIds), conflictFiles };
}

const flowStore: FlowStoreInternal = {
  _listeners: new Set<Listener>(),

  getFlows() {
    return state.flows;
  },

  getFlowsPath() {
    return state.flowsPath;
  },

  getConflictIds() {
    return state.conflictIds;
  },

  getConflictFiles() {
    return state.conflictFiles;
  },

  get isLoaded() {
    return state.isLoaded;
  },

  async load() {
    if (state.isLoaded) return;
    await this.refresh();
    state.isLoaded = true;
  },

  async refresh() {
    const result = await loadFlowsFromDisk();
    state.flows = result.flows;
    state.flowsPath = result.flowsPath;
    state.conflictIds = result.conflictIds;
    state.conflictFiles = result.conflictFiles;
    dispatch();
  },

  subscribe(listener: Listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  },
};

export { flowStore };
