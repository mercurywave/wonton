import { Task } from "../types/chat";
import {
  TASKS_DIR_NAME,
  isBackendConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

async function listTasks(projectId: string): Promise<Task[]> {
  if (!isBackendConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;

  try {
    const entries = await filesystem.readDirectory(tasksDir);
    const tasks: Task[] = [];
    for (const entry of entries) {
      const name = entry.entry;
      if (name.endsWith(".json")) {
        try {
          const content = await filesystem.readFile(`${tasksDir}/${name}`);
          const task = JSON.parse(content) as Task;
          task.id = task.id || name.replace(".json", "");
          tasks.push(task);
        } catch {
          // ignore malformed files
        }
      }
    }
    return tasks.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

async function ensureTasksDir(projectId: string): Promise<void> {
  if (!isBackendConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;

  try {
    await filesystem.createDirectory(tasksDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("taskStore: failed to create tasks dir", err);
    }
  }
}

type Listener = () => void;

interface TaskState {
  tasks: Task[];
  isLoaded: boolean;
}

interface TasksStore {
  getTasks(projectId: string): Task[];
  getActiveTasks(projectId: string): Task[];
  getGraduatedTasks(projectId: string): Task[];
  getTaskById(projectId: string, taskId: string): Task | undefined;
  load(projectId: string): Promise<void>;
  createTask(projectId: string, text: string, priority?: Task["priority"]): Promise<Task>;
  updateTask(projectId: string, taskId: string, updates: Partial<Task>): Promise<void>;
  deleteTask(projectId: string, taskId: string): Promise<void>;
  graduateTask(projectId: string, taskId: string, chatId: string): Promise<void>;
  subscribe(listener: Listener): () => void;
}

interface TasksStoreInternal extends TasksStore {
  _listeners: Set<Listener>;
  _dispatch(): void;
}

const state = new Map<string, TaskState>();
const listeners = new Set<Listener>();

function dispatch() {
  for (const listener of listeners) {
    listener();
  }
}

const taskStore: TasksStoreInternal = {
  _listeners: new Set<Listener>(),

  getTasks(projectId: string) {
    return state.get(projectId)?.tasks ?? [];
  },

  getActiveTasks(projectId: string) {
    return state.get(projectId)?.tasks.filter((t) => !t.graduatedAt) ?? [];
  },

  getGraduatedTasks(projectId: string) {
    return state.get(projectId)?.tasks.filter((t) => t.graduatedAt) ?? [];
  },

  getTaskById(projectId: string, taskId: string) {
    return state.get(projectId)?.tasks.find((t) => t.id === taskId);
  },

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    await ensureTasksDir(projectId);
    const tasks = await listTasks(projectId);
    state.set(projectId, { tasks, isLoaded: true });
    dispatch();
  },

  async createTask(projectId, text, priority) {
    if (!isBackendConnected()) {
      const task: Task = {
        id: generateGuid(),
        projectId,
        text,
        createdAt: Date.now(),
        priority,
      };
      const current = state.get(projectId);
      if (current) {
        state.set(projectId, { tasks: [task, ...current.tasks], isLoaded: true });
        dispatch();
      }
      return task;
    }

    await ensureTasksDir(projectId);
    const projectDir = await getProjectDataDir(projectId);
    const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;

    const task: Task = {
      id: generateGuid(),
      projectId,
      text,
      createdAt: Date.now(),
      priority,
    };

    try {
      await filesystem.writeFile(
        `${tasksDir}/${task.id}.json`,
        JSON.stringify(task, null, 2)
      );
    } catch (err) {
      console.error("taskStore: failed to write task", err);
    }

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, { tasks: [task, ...current.tasks], isLoaded: true });
      dispatch();
    }

    return task;
  },

  async updateTask(projectId, taskId, updates) {
    const current = state.get(projectId);
    if (!current) return;

    const idx = current.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) return;

    const existing = current.tasks[idx];
    const next = { ...existing, ...updates, updatedAt: Date.now() } as Task;

    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;
      try {
        await filesystem.writeFile(
          `${tasksDir}/${taskId}.json`,
          JSON.stringify(next, null, 2)
        );
      } catch (err) {
        console.error("taskStore: failed to update task", err);
      }
    }

    state.set(projectId, {
      tasks: current.tasks.map((t) => (t.id === taskId ? next : t)),
      isLoaded: true,
    });
    dispatch();
  },

  async deleteTask(projectId, taskId) {
    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;
      try {
        await filesystem.remove(`${tasksDir}/${taskId}.json`);
      } catch (err) {
        console.error("taskStore: failed to delete task", err);
      }
    }

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, {
        tasks: current.tasks.filter((t) => t.id !== taskId),
        isLoaded: true,
      });
      dispatch();
    }
  },

  async graduateTask(projectId, taskId, chatId) {
    const current = state.get(projectId);
    if (!current) return;

    const task = current.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const next = { ...task, graduatedAt: Date.now(), chatId } as Task;

    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const tasksDir = `${projectDir}/${TASKS_DIR_NAME}`;
      try {
        await filesystem.writeFile(
          `${tasksDir}/${taskId}.json`,
          JSON.stringify(next, null, 2)
        );
      } catch (err) {
        console.error("taskStore: failed to graduate task", err);
      }
    }

    state.set(projectId, {
      tasks: current.tasks.map((t) => (t.id === taskId ? next : t)),
      isLoaded: true,
    });
    dispatch();
  },

  subscribe(listener: Listener) {
    this._listeners.add(listener);
    listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
      listeners.delete(listener);
    };
  },

  _dispatch: dispatch,
};

export { taskStore };
