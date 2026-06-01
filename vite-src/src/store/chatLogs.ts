import { ChatMessage } from "../types/chat";
import {
  MSGS_DIR_NAME,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/neuUtils";
import { filesystem } from "@neutralinojs/lib";

// --- persistence functions ---

async function _readLog(projectId: string, logId: string): Promise<ChatMessage[]> {
  if (!isNeutralinoConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  const jsonlPath = `${msgsDir}/${logId}.jsonl`;

  try {
    const content = await filesystem.readFile(jsonlPath);
    if (!content.trim()) return [];

    const lines = content.trim().split("\n");
    const messages: ChatMessage[] = [];
    const seenIds = new Set<string>();
    for (const line of lines) {
      try {
        const msg = JSON.parse(line) as ChatMessage;
        if (seenIds.has(msg.id)) continue;
        seenIds.add(msg.id);
        messages.push(msg);
      } catch {
        // ignore malformed lines
      }
    }
    return messages;
  } catch {
    return [];
  }
}

async function _appendMessage(projectId: string, logId: string, message: ChatMessage): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  const jsonlPath = `${msgsDir}/${logId}.jsonl`;

  const line = JSON.stringify(message) + "\n";
  await filesystem.appendFile(jsonlPath, line);
}

async function _deleteLog(projectId: string, logId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  const jsonlPath = `${msgsDir}/${logId}.jsonl`;

  try {
    await filesystem.remove(jsonlPath);
  } catch (err) {
    console.error("chatLogsStore: failed to delete log", err);
  }
}

// --- store ---

type Listener = () => void;

interface ChatLogState {
  logs: Map<string, ChatMessage[]>;
  pendingMessageIds: Map<string, string>;
  isLoaded: boolean;
}

interface ChatLogsStore {
  getLog(projectId: string, logId: string): ChatMessage[] | undefined;
  load(projectId: string, logId: string): Promise<void>;
  appendMessage(projectId: string, logId: string, message: ChatMessage): Promise<void>;
  createLog(projectId: string): Promise<string>;
  deleteLog(projectId: string, logId: string): Promise<void>;
  subscribe(projectId: string, logId: string, listener: Listener): () => void;
  setPendingMessage(projectId: string, logId: string, messageId: string): void;
  clearPendingMessage(projectId: string, logId: string): void;
  getPendingMessageId(projectId: string, logId: string): string | undefined;
}

const state = new Map<string, ChatLogState>();
const listeners = new Map<string, Map<string, Set<Listener>>>();

function getListeners(projectId: string, logId: string): Set<Listener> {
  const projectListeners = listeners.get(projectId);
  if (!projectListeners) {
    const newMap = new Map<string, Set<Listener>>();
    newMap.set(logId, new Set<Listener>());
    listeners.set(projectId, newMap);
    return newMap.get(logId)!;
  }
  if (!projectListeners.has(logId)) {
    projectListeners.set(logId, new Set<Listener>());
  }
  return projectListeners.get(logId)!;
}

function dispatch(projectId: string, logId: string) {
  const set = listeners.get(projectId)?.get(logId);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

const chatLogsStore: ChatLogsStore = {
  getLog(projectId: string, logId: string): ChatMessage[] | undefined {
    const projectState = state.get(projectId);
    if (!projectState) return undefined;
    const messages = projectState.logs.get(logId);
    if (!messages) return undefined;

    const pendingId = projectState.pendingMessageIds.get(logId);
    if (!pendingId) return messages;

    const hasPending = messages.some((m) => m.id === pendingId);
    if (hasPending) return messages;

    return [...messages, {
      id: pendingId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      toolCalls: [],
    }];
  },

  async load(projectId: string, logId: string) {
    const projectState = state.get(projectId);
    if (projectState?.logs.has(logId)) return;

    const messages = await _readLog(projectId, logId);
    const current = state.get(projectId);
    const logs = current?.logs || new Map<string, ChatMessage[]>();
    const pendingIds = current?.pendingMessageIds || new Map<string, string>();
    logs.set(logId, messages);
    state.set(projectId, { logs, pendingMessageIds: pendingIds, isLoaded: true });
    dispatch(projectId, logId);
  },

  async appendMessage(projectId, logId, message) {
    await _appendMessage(projectId, logId, message);

    const projectState = state.get(projectId);
    if (projectState) {
      const messages = projectState.logs.get(logId);
      if (messages) {
        const next = [...messages, message];
        const logs = new Map(projectState.logs);
        logs.set(logId, next);
        const pendingIds = new Map(projectState.pendingMessageIds);
        if (pendingIds.get(logId) === message.id) {
          pendingIds.delete(logId);
        }
        state.set(projectId, { logs, pendingMessageIds: pendingIds, isLoaded: true });
        dispatch(projectId, logId);
      }
    }
  },

  async createLog(projectId: string): Promise<string> {
    const logId = generateGuid();

    if (isNeutralinoConnected()) {
      try {
        const projectDir = await getProjectDataDir(projectId);
        const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
        await filesystem.writeFile(`${msgsDir}/${logId}.jsonl`, "");
      } catch (err) {
        console.error("chatLogsStore: failed to create log file", err);
      }
    }

    const current = state.get(projectId);
    const logs = current?.logs || new Map<string, ChatMessage[]>();
    const pendingIds = current?.pendingMessageIds || new Map<string, string>();
    logs.set(logId, []);
    state.set(projectId, { logs, pendingMessageIds: pendingIds, isLoaded: true });
    dispatch(projectId, logId);

    return logId;
  },

  async deleteLog(projectId: string, logId: string) {
    await _deleteLog(projectId, logId);

    const projectState = state.get(projectId);
    if (projectState) {
      const logs = new Map(projectState.logs);
      const pendingIds = new Map(projectState.pendingMessageIds);
      pendingIds.delete(logId);
      logs.delete(logId);
      state.set(projectId, { logs, pendingMessageIds: pendingIds, isLoaded: true });
    }
    listeners.get(projectId)?.delete(logId);
  },

  subscribe(projectId: string, logId: string, listener: Listener) {
    getListeners(projectId, logId).add(listener);
    return () => {
      listeners.get(projectId)?.get(logId)?.delete(listener);
    };
  },

  setPendingMessage(projectId: string, logId: string, messageId: string) {
    const projectState = state.get(projectId);
    if (!projectState) return;
    const pendingIds = new Map(projectState.pendingMessageIds);
    pendingIds.set(logId, messageId);
    state.set(projectId, { logs: new Map(projectState.logs), pendingMessageIds: pendingIds, isLoaded: true });
    dispatch(projectId, logId);
  },

  clearPendingMessage(projectId: string, logId: string) {
    const projectState = state.get(projectId);
    if (!projectState) return;
    const pendingIds = new Map(projectState.pendingMessageIds);
    pendingIds.delete(logId);
    state.set(projectId, { logs: new Map(projectState.logs), pendingMessageIds: pendingIds, isLoaded: true });
    dispatch(projectId, logId);
  },

  getPendingMessageId(projectId: string, logId: string): string | undefined {
    return state.get(projectId)?.pendingMessageIds.get(logId);
  },
};

export { chatLogsStore };
