import { Project } from "../types/project";
import {
  PROJECTS_FILE_NAME,
  DEFAULT_PROJECT_ID,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/neuUtils";
import {
  ensureChatFolder as ensureChatFolderNative,
} from "../hooks/useChatPersistence";
import { CHATS_DIR_NAME, MSGS_DIR_NAME } from "../utils/neuUtils";
import { projectMetaStore } from "./projectMeta";
import { filesystem } from "@neutralinojs/lib";

async function deleteProjectFolder(projectId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);

  try {
    const projPath = `${projectDir}/${"proj.json"}`;
    await filesystem.remove(projPath);
    const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
    const entries = await filesystem.readDirectory(chatsDir);
    for (const entry of entries) {
      await filesystem.remove(`${chatsDir}/${entry.entry}`);
    }
    await filesystem.remove(chatsDir);
    const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
    const msgEntries = await filesystem.readDirectory(msgsDir);
    for (const entry of msgEntries) {
      await filesystem.remove(`${msgsDir}/${entry.entry}`);
    }
    await filesystem.remove(msgsDir);
  } catch (err) {
    console.error("projectStore: failed to delete project folder", err);
  }
}

function createDefaultProject(): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "Default",
    createdAt: Date.now(),
  };
}

type Listener = () => void;

interface ProjectStore {
  getProjects(): Project[];
  load(): Promise<void>;
  createProject(name: string, folderPath?: string): Promise<void>;
  updateProject(id: string, updates: Partial<Project>): Promise<void>;
  deleteProject(id: string): Promise<void>;
  getProjectById(id: string): Project | undefined;
  subscribe(listener: Listener): () => void;
}

interface ProjectStoreInternal extends ProjectStore {
  _listeners: Set<Listener>;
  _save(): Promise<void>;
}

const state = {
  projects: [] as Project[],
  isLoaded: false,
};

function dispatch() {
  const listeners = projectStore._listeners;
  for (const listener of listeners) {
    listener();
  }
}

async function ensureDataDir(): Promise<string> {
  let dataDirPath: string;
  try {
    dataDirPath = await getProjectDataDir("");
  } catch (err) {
    console.error("projectStore: failed to get data dir path", err);
    return "";
  }

  const wontonDir = dataDirPath;
  try {
    await filesystem.createDirectory(wontonDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("projectStore: failed to create directory", err);
    }
  }

  return wontonDir;
}

async function getFilePath(): Promise<string> {
  const dataDir = await ensureDataDir();
  return `${dataDir}/${PROJECTS_FILE_NAME}`;
}

const projectStore: ProjectStoreInternal = {
  _listeners: new Set<Listener>(),

  getProjects() {
    return state.projects;
  },

  async _save() {
    if (!isNeutralinoConnected()) return;
    const filePath = await getFilePath();
    if (!filePath) return;
    try {
      await filesystem.writeFile(filePath, JSON.stringify(state.projects, null, 2));
    } catch (err) {
      console.error("projectStore: failed to save projects", err);
    }
  },

  async load() {
    if (state.isLoaded) return;

    if (!isNeutralinoConnected()) {
      state.projects = [createDefaultProject()];
      state.isLoaded = true;
      return;
    }

    const filePath = await getFilePath();
    if (!filePath) {
      state.projects = [createDefaultProject()];
      state.isLoaded = true;
      return;
    }

    // Ensure the default project's folder structure exists before loading
    try {
      await projectMetaStore.load(DEFAULT_PROJECT_ID);
      const projMeta = projectMetaStore.getProjectMeta(DEFAULT_PROJECT_ID);
      if (!projMeta?.createdAt) {
        await ensureChatFolderNative(DEFAULT_PROJECT_ID);
      }
    } catch (err) {
      console.error("projectStore: failed to ensure default project folder", err);
    }

    try {
      const content = await filesystem.readFile(filePath);
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const hasDefault = parsed.some((p: Project) => p.id === DEFAULT_PROJECT_ID);
        if (!hasDefault) {
          parsed.unshift(createDefaultProject());
          await filesystem.writeFile(filePath, JSON.stringify(parsed, null, 2));
        }
        state.projects = parsed;
      } else {
        const defaultProject = createDefaultProject();
        state.projects = [defaultProject];
        await filesystem.writeFile(filePath, JSON.stringify([defaultProject], null, 2));
      }
    } catch (err) {
      console.error("projectStore: failed to load projects", err);
      const defaultProject = createDefaultProject();
      state.projects = [defaultProject];
      try {
        await filesystem.writeFile(filePath, JSON.stringify([defaultProject], null, 2));
      } catch (err2) {
        console.error("projectStore: failed to write default projects file", err2);
      }
    }

    state.isLoaded = true;
  },

  async createProject(name: string, folderPath?: string) {
    const newProject: Project = {
      id: generateGuid(),
      name,
      folderPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    state.projects = [...state.projects, newProject];
    await this._save();
    if (isNeutralinoConnected()) {
      try {
        await ensureChatFolderNative(newProject.id);
      } catch (err) {
        console.error("projectStore: failed to create project folder", err);
      }
    }
    dispatch();
  },

  async updateProject(id: string, updates: Partial<Project>) {
    const idx = state.projects.findIndex((p) => p.id === id);
    if (idx === -1) return;
    state.projects[idx] = { ...state.projects[idx], ...updates, updatedAt: Date.now() };
    await this._save();
    if (updates.name !== undefined) {
      try {
        await projectMetaStore.update(id, { systemPrompt: updates.name });
      } catch (err) {
        console.error("projectStore: failed to update project meta", err);
      }
    }
    dispatch();
  },

  async deleteProject(id: string) {
    if (id === DEFAULT_PROJECT_ID) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    await this._save();
    if (isNeutralinoConnected()) {
      try {
        await deleteProjectFolder(id);
      } catch (err) {
        console.error("projectStore: failed to delete project folder", err);
      }
    }
    dispatch();
  },

  getProjectById(id: string) {
    return state.projects.find((p) => p.id === id);
  },

  subscribe(listener: Listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  },
};

export { projectStore };
