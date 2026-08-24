import { ProjectCustomTool } from "../types/chat";
import {
  isBackendConnected,
  getToolsDirPath,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";
import { parse as yamlParse } from "yaml";

const TOOL_EXT = ".yaml";

interface LoadResult {
  tools: ProjectCustomTool[];
  toolsDirPath: string;
}

type Listener = () => void;

interface ToolStore {
  getTools(): ProjectCustomTool[];
  getToolsDirPath(): string;
  load(projectId: string): Promise<void>;
  refresh(): Promise<void>;
  subscribe(listener: Listener): () => void;
}

interface ToolStoreInternal extends ToolStore {
  _listeners: Set<Listener>;
  isLoaded: boolean;
  _currentProjectId: string;
}

const state = {
  tools: [] as ProjectCustomTool[],
  toolsDirPath: "",
  isLoaded: false,
  _currentProjectId: "",
};

function dispatch() {
  const listeners = toolStore._listeners;
  for (const listener of listeners) {
    listener();
  }
}

async function loadToolsFromDirectory(dirPath: string): Promise<ProjectCustomTool[]> {
  let entries: { entry: string }[] = [];
  try {
    entries = await filesystem.readDirectory(dirPath);
  } catch {
    return [];
  }

  const tools: ProjectCustomTool[] = [];
  for (const entry of entries) {
    const name = entry.entry;
    if (!name.endsWith(TOOL_EXT)) continue;

    const filePath = `${dirPath}/${name}`;

    try {
      const content = await filesystem.readFile(filePath);
      const data = yamlParse(content)! as Record<string, unknown>;
      if (!data.name) throw new Error("name is required");
      if (!data.description) throw new Error("description is required");
      if (!data.code) throw new Error("code is required");
      tools.push({
        name: data.name as string,
        description: data.description as string,
        code: data.code as string,
      });
    } catch (e) {
      console.warn(`loadToolsFromDirectory: failed to parse ${name}:`, e);
    }
  }

  return tools;
}

async function loadToolsFromDisk(projectId: string): Promise<LoadResult> {
  if (!isBackendConnected()) {
    return { tools: [...state.tools], toolsDirPath: state.toolsDirPath };
  }

  const toolsDir = await getToolsDirPath(projectId);

  const tools = await loadToolsFromDirectory(toolsDir);

  return { tools, toolsDirPath: toolsDir };
}

async function ensureToolsDirectory(projectId: string): Promise<void> {
  const projectDir = await getToolsDirPath(projectId);
  const parentDir = projectDir.includes("/")
    ? projectDir.substring(0, projectDir.lastIndexOf("/"))
    : "";

  if (parentDir) {
    try {
      await filesystem.createDirectory(parentDir);
    } catch {
      // parent may not exist yet or may already exist
    }
  }

  if (projectDir) {
    try {
      await filesystem.createDirectory(projectDir);
    } catch {
      // directory may already exist
    }
  }
}

const toolStore: ToolStoreInternal = {
  _listeners: new Set<Listener>(),
  _currentProjectId: "",

  getTools() {
    return state.tools;
  },

 getToolsDirPath() {
    return state.toolsDirPath;
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
    await ensureToolsDirectory(projectId);
    await this.refresh();
    state.isLoaded = true;
  },

  async refresh() {
    const result = await loadToolsFromDisk(state._currentProjectId);
    state.tools = result.tools;
    state.toolsDirPath = result.toolsDirPath;
    dispatch();
  },

  subscribe(listener: Listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  },
};

export { toolStore };
