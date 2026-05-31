import { ProjectMeta } from "../types/chat";
import { filesystem } from "@neutralinojs/lib";
import {
  PROJ_FILE_NAME,
  isNeutralinoConnected,
  getProjectDataDir,
} from "../utils/neuUtils";

type Listener = () => void;

interface ProjectMetaState {
  meta: ProjectMeta | null;
  isLoaded: boolean;
}

interface ProjectMetaStore {
  getProjectMeta(projectId: string): ProjectMeta | null;
  load(projectId: string): Promise<void>;
  update(projectId: string, updates: Partial<ProjectMeta>): Promise<void>;
  subscribe(projectId: string, listener: Listener): () => void;
  refresh(projectId: string): Promise<void>;
  getDisabledFlows(projectId: string): string[];
  setDisabledFlows(projectId: string, disabledFlows: string[]): Promise<void>;
}

const state = new Map<string, ProjectMetaState>();
const listeners = new Map<string, Set<Listener>>();

function dispatch(projectId: string) {
  const set = listeners.get(projectId);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

async function _loadProjectMeta(projectId: string): Promise<ProjectMeta> {
  if (!isNeutralinoConnected()) return { createdAt: Date.now() };

  const projectDir = await getProjectDataDir(projectId);
  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;

  try {
    const content = await filesystem.readFile(projPath);
    return JSON.parse(content) as ProjectMeta;
  } catch {
    return { createdAt: Date.now() };
  }
}

async function _updateProjectMeta(
  projectId: string,
  updates: Partial<ProjectMeta>
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;

  try {
    let content: string;
    try {
      content = await filesystem.readFile(projPath);
    } catch {
      content = "{}";
    }
    const existingMeta: ProjectMeta = JSON.parse(content);
    const next = { ...existingMeta, ...updates };
    await filesystem.writeFile(projPath, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("projectMetaStore: failed to write proj.json", err);
  }
}

const projectMetaStore: ProjectMetaStore = {
  getProjectMeta(projectId: string) {
    return state.get(projectId)?.meta ?? null;
  },

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    const meta = await _loadProjectMeta(projectId);
    state.set(projectId, { meta, isLoaded: true });
    dispatch(projectId);
  },

  async update(projectId: string, updates: Partial<ProjectMeta>) {
    await _updateProjectMeta(projectId, updates);

    const current = state.get(projectId);
    if (current?.meta) {
      const next = { ...current.meta, ...updates };
      state.set(projectId, { meta: next, isLoaded: true });
      dispatch(projectId);
    }
  },

  subscribe(projectId: string, listener: Listener) {
    if (!listeners.has(projectId)) {
      listeners.set(projectId, new Set<Listener>());
    }
    listeners.get(projectId)!.add(listener);
    return () => {
      listeners.get(projectId)?.delete(listener);
    };
  },

  async refresh(projectId: string) {
    const meta = await _loadProjectMeta(projectId);
    state.set(projectId, { meta, isLoaded: true });
    dispatch(projectId);
  },

  getDisabledFlows(projectId: string) {
    const meta = state.get(projectId)?.meta;
    return meta?.disabledFlows ?? [];
  },

  async setDisabledFlows(projectId: string, disabledFlows: string[]) {
    await this.update(projectId, { disabledFlows });
  },
};

export { projectMetaStore };
