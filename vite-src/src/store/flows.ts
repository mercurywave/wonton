import { Flow } from "../types/chat";
import {
  isBackendConnected,
  getFlowsDirPath,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";
import { parse as yamlParse } from "yaml";

const FLOW_EXT = ".yaml";

interface LoadResult {
  flows: Flow[];
  globalFlowsPath: string;
  projectFlowsPath: string;
  conflictIds: string[];
  conflictFiles: Record<string, string>;
  overriddenGlobalIds: string[];
}

type Listener = () => void;

interface FlowStore {
  getFlows(): Flow[];
  getGlobalFlowsPath(): string;
  getProjectFlowsPath(): string;
  getConflictIds(): string[];
  getConflictFiles(): Record<string, string>;
  getOverriddenGlobalIds(): string[];
  load(projectId: string): Promise<void>;
  refresh(): Promise<void>;
  subscribe(listener: Listener): () => void;
}

interface FlowStoreInternal extends FlowStore {
  _listeners: Set<Listener>;
  isLoaded: boolean;
  _currentProjectId: string;
}

const state = {
  flows: [] as Flow[],
  globalFlowsPath: "",
  projectFlowsPath: "",
  conflictIds: [] as string[],
  conflictFiles: {} as Record<string, string>,
  overriddenGlobalIds: [] as string[],
  isLoaded: false,
  _currentProjectId: "",
};

function dispatch() {
  const listeners = flowStore._listeners;
  for (const listener of listeners) {
    listener();
  }
}

async function loadFlowsFromDirectory(dirPath: string, source: string): Promise<{ flows: Flow[]; conflictIds: string[]; conflictFiles: Record<string, string> }> {
  let entries: { entry: string }[] = [];
  try {
    entries = await filesystem.readDirectory(dirPath);
  } catch {
    return { flows: [], conflictIds: [], conflictFiles: {} };
  }

  const flows: Flow[] = [];
  const flowSources = new Map<string, string>();
  for (const entry of entries) {
    const name = entry.entry;
    if (!name.endsWith(FLOW_EXT)) continue;

    const filePath = `${dirPath}/${name}`;

    try {
      const content = await filesystem.readFile(filePath);
      const data = yamlParse(content)! as Record<string, unknown>;
      if (!data.id) throw new Error("id is required");
      if (!data.name) throw new Error("name is required");
      if (typeof data.command === "string") {
        data.isCommand = true;
      }
      (data as any).source = source;
      flows.push(data as unknown as Flow);
      flowSources.set(data.id as string, name);
    } catch (e) {
      console.warn(`loadFlowsFromDirectory: failed to parse ${name}:`, e);
    }
  }

  // Check for conflicts within this directory
  const seen = new Map<string, Flow>();
  const conflictIds = new Set<string>();
  const conflictFiles: Record<string, string> = {};
  for (const flow of flows) {
    const id = flow.id;
    if (seen.has(id)) {
      conflictIds.add(id);
      const currentFile = flowSources.get(id) ?? "unknown";
      conflictFiles[id] = currentFile;
      console.error(`loadFlowsFromDirectory: conflicting workflow id "${id}" in "${currentFile}" — skipping duplicate.`);
    }
    seen.set(id, flow);
  }
  const deduped = Array.from(seen.values());

  return { flows: deduped, conflictIds: Array.from(conflictIds), conflictFiles };
}

async function loadFlowsFromDisk(projectId: string): Promise<LoadResult> {
  if (!isBackendConnected()) {
    return { flows: [...state.flows], globalFlowsPath: state.globalFlowsPath, projectFlowsPath: state.projectFlowsPath, conflictIds: [], conflictFiles: {}, overriddenGlobalIds: [] };
  }

  const globalFlowsDir = await getFlowsDirPath(undefined);
  const projectFlowsDir = await getFlowsDirPath(projectId);

  // Load global flows first
  const globalResult = await loadFlowsFromDirectory(globalFlowsDir, "global");
  const globalFlows = new Map<string, Flow>(globalResult.flows.map((f) => [f.id, f]));

  // Load project flows (silently override global)
  const projectResult = await loadFlowsFromDirectory(projectFlowsDir, projectId);
  const projectFlows = new Map<string, Flow>(projectResult.flows.map((f) => [f.id, f]));

  // Track which global flows are overridden
  const overriddenGlobalIds: string[] = [];
  for (const flow of projectResult.flows) {
    if (globalFlows.has(flow.id)) {
      overriddenGlobalIds.push(flow.id);
    }
  }

  // Merge: global + project overrides
  const mergedFlows = new Map<string, Flow>();
  for (const [id, flow] of globalFlows) {
    mergedFlows.set(id, flow);
  }
  for (const [id, flow] of projectFlows) {
    mergedFlows.set(id, flow);
  }

  // Combine conflicts (project-level conflicts take precedence in conflictFiles)
  const combinedConflictIds = new Set<string>(globalResult.conflictIds);
  projectResult.conflictIds.forEach((id) => combinedConflictIds.add(id));
  const combinedConflictFiles: Record<string, string> = { ...globalResult.conflictFiles, ...projectResult.conflictFiles };

  // Sort: project flows first (by name), then global flows (by name)
  const projectFlowList = Array.from(projectFlows.values()).sort((a, b) => a.name.localeCompare(b.name));
  const globalFlowList = Array.from(globalFlows.values())
    .sort((a, b) => a.name.localeCompare(b.name));
  const flows = [...projectFlowList, ...globalFlowList];

  return { flows, globalFlowsPath: globalFlowsDir, projectFlowsPath: projectFlowsDir, conflictIds: Array.from(combinedConflictIds), conflictFiles: combinedConflictFiles, overriddenGlobalIds };
}

const flowStore: FlowStoreInternal = {
  _listeners: new Set<Listener>(),
  _currentProjectId: "",

  getFlows() {
    return state.flows;
  },

  getGlobalFlowsPath() {
    return state.globalFlowsPath;
  },

  getProjectFlowsPath() {
    return state.projectFlowsPath;
  },

  getConflictIds() {
    return state.conflictIds;
  },

  getConflictFiles() {
    return state.conflictFiles;
  },

  getOverriddenGlobalIds() {
    return state.overriddenGlobalIds;
  },

  get isLoaded() {
    return state.isLoaded;
  },

  async load(projectId: string) {
    if (state.isLoaded) {
      state._currentProjectId = projectId;
      return;
    }
    state._currentProjectId = projectId;
    await this.refresh();
    state.isLoaded = true;
  },

  async refresh() {
    const result = await loadFlowsFromDisk(state._currentProjectId);
    state.flows = result.flows;
    state.globalFlowsPath = result.globalFlowsPath;
    state.projectFlowsPath = result.projectFlowsPath;
    state.conflictIds = result.conflictIds;
    state.conflictFiles = result.conflictFiles;
    state.overriddenGlobalIds = result.overriddenGlobalIds;
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
