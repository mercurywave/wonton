import { ChatMeta, ChatMessage, SubagentMeta, TempFileReservation } from "../types/chat";
import { FeedbackPayload } from "../contexts";
import { chatLogsStore } from "./chatLogs";
import {
  CHATS_DIR_NAME,
  MSGS_DIR_NAME,
  TMP_DIR_NAME,
  PROJ_FILE_NAME,
  isBackendConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

// --- approval queue (runtime-only, not persisted) ---

export interface ApprovalRequest {
  requestId: string;
  chatId: string;
  logId: string;
  payload: FeedbackPayload;
  resolve: (choice: number | void) => void;
  reject: (reason: unknown) => void;
}

interface ProjectApprovalQueue {
  [chatId: string]: ApprovalRequest[];
}

const approvalQueues = new Map<string, ProjectApprovalQueue>();

function dispatchApprovalListeners(projectId: string) {
  const set = approvalListeners.get(projectId);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

const approvalListeners = new Map<string, Set<Listener>>();

// --- persistence functions for chat metas ---

async function listChatMeta(projectId: string): Promise<ChatMeta[]> {
  if (!isBackendConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;

  try {
    const entries = await filesystem.readDirectory(chatsDir);
    const metas: ChatMeta[] = [];
    for (const entry of entries) {
      const name = entry.entry;
      if (name.endsWith(".json") && !name.includes(PROJ_FILE_NAME)) {
        const chatId = name.replace(".json", "");
        try {
          const content = await filesystem.readFile(`${chatsDir}/${name}`);
          const meta = JSON.parse(content) as ChatMeta;
          meta.id = chatId;
          meta.projectId = meta.projectId || projectId;
          metas.push(meta);
        } catch {
          // ignore malformed files
        }
      }
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

async function createChat(
  projectId: string,
  name?: string,
  workflowId?: string,
  workflowStateKey?: string
): Promise<ChatMeta> {
  if (!isBackendConnected()) {
    const chatId = generateGuid();
    const logId = generateGuid();
    return {
      id: chatId,
      projectId,
      name: name || `Chat ${new Date().toLocaleTimeString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workflowId,
      workflowStateKey,
      logId: logId,
    };
  }

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  const chatId = generateGuid();
  const logId = generateGuid();
  const queriesLogId = generateGuid();
  const now = Date.now();

  const chatMeta: ChatMeta = {
    id: chatId,
    projectId,
    name: name || `Chat ${new Date().toLocaleTimeString()}`,
    createdAt: now,
    updatedAt: now,
    workflowId,
    workflowStateKey,
    logId: logId,
    queriesLogId: queriesLogId,
  };

  try {
    await filesystem.writeFile(
      `${chatsDir}/${chatId}.json`,
      JSON.stringify(chatMeta, null, 2)
    );
    await filesystem.writeFile(`${msgsDir}/${logId}.jsonl`, "");
    await chatLogsStore.reserveLog(projectId, queriesLogId);
  } catch (err) {
    console.error("createChat: failed to write chat files", err);
  }

  return chatMeta;
}

async function deleteChat(projectId: string, chatId: string): Promise<void> {
  if (!isBackendConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  const tmpDir = `${projectDir}/${TMP_DIR_NAME}`;

  try {
    const content = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(content) as ChatMeta;

    // Clean up reserved temp files before deleting the chat
    if (meta.reservedTempFiles?.length) {
      for (const reservation of meta.reservedTempFiles) {
        try {
          await filesystem.remove(`${tmpDir}/${reservation.uniqueName}`);
        } catch {
          // Temp file may have already been deleted, silently ignore
        }
      }
    }

    await filesystem.remove(`${chatsDir}/${chatId}.json`);
    if (meta.logId) {
      await filesystem.remove(`${msgsDir}/${meta.logId}.jsonl`);
    }
    if (meta.subagents?.length) {
      for (const subagent of meta.subagents) {
        if (subagent.logId) {
          try{
            await filesystem.remove(`${msgsDir}/${subagent.logId}.jsonl`);
          } catch { }
        }
      }
    }
    if (meta.versionHistory?.length) {
      for (const entry of meta.versionHistory) {
        if (entry.logId) {
          try {
            await filesystem.remove(`${msgsDir}/${entry.logId}.jsonl`);
          } catch { }
        }
      }
    }
    if (meta.queriesLogId) {
      try {
        await filesystem.remove(`${msgsDir}/${meta.queriesLogId}.jsonl`);
      } catch { }
    }
  } catch (err) {
    console.error("deleteChat: failed to remove chat files", err);
  }
}

async function updateChatMeta(
  projectId: string,
  chatId: string,
  updates: Partial<ChatMeta>,
  silent?: boolean
): Promise<ChatMeta | null> {
  if (!isBackendConnected()) return null;

  const projectDir = await getProjectDataDir(projectId);
  const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;

  try {
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    const effectiveUpdates = Object.fromEntries(
      Object.entries(updates).filter(([k, v]) => {
        const key = k as keyof ChatMeta;
        return JSON.stringify(meta[key]) !== JSON.stringify(v);
      })
    );
    if (Object.keys(effectiveUpdates).length === 0) return meta;
    const next = { ...meta, ...effectiveUpdates, updatedAt: Date.now() };
    await filesystem.writeFile(metaPath, JSON.stringify(next, null, 2));
    
    const current = state.get(projectId);
    if (current) {
      const metas = current.metas.map((c) =>
        c.id === chatId ? next : c
      );
      state.set(projectId, { metas, isLoaded: true });
      if(!silent) { dispatch(projectId); }
    }
    
    return next;
  } catch (err) {
    console.error("updateChatMeta: failed to update chat meta", err);
  }
  return null;
}

// --- store ---

type Listener = () => void;

interface ChatsState {
  metas: ChatMeta[];
  isLoaded: boolean;
}

interface ChatsStore {
  getChatMetas(projectId: string): ChatMeta[];
  getChat(projectId: string, chatId: string): ChatMeta | undefined;
  getLogId(projectId: string, chatId: string): string;
  load(projectId: string): Promise<void>;
  createChat(
    projectId: string,
    name?: string,
    workflowId?: string,
    workflowStateKey?: string
  ): Promise<ChatMeta>;
  deleteChat(projectId: string, chatId: string): Promise<void>;
  renameChat(projectId: string, chatId: string, name: string): Promise<void>;
  setChatDraft(projectId: string, chatId: string, draft: string, silent?: boolean): Promise<void>;
  updateChatMeta(
    projectId: string,
    chatId: string,
    updates: Partial<ChatMeta>
  ): Promise<void>;
  refresh(projectId: string): Promise<ChatMeta[]>;
  subscribe(projectId: string, listener: Listener): () => void;
  getReservedTempFiles(projectId: string, chatId: string): Promise<TempFileReservation[] | undefined>;
  saveSubagentMeta(projectId: string, chatId: string, subagentMeta: SubagentMeta): Promise<void>;
  createNewVersionLog(projectId: string, chatId: string): Promise<string>;
  appendMessage(projectId: string, chatId: string, logId: string, message: ChatMessage): Promise<void>;
}

const state = new Map<string, ChatsState>();
const listeners = new Map<string, Set<Listener>>();

function dispatch(projectId: string) {
  const set = listeners.get(projectId);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

const chatStore: ChatsStore = {
  getChatMetas(projectId: string) {
    return state.get(projectId)?.metas ?? [];
  },

  getChat(projectId: string, chatId: string) {
    return state.get(projectId)?.metas.find((m) => m.id === chatId);
  },

  getLogId(projectId: string, chatId: string) {
    const meta = state.get(projectId)?.metas.find((m) => m.id === chatId);
    return meta?.logId || chatId;
  },

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    const metas = await listChatMeta(projectId);
    state.set(projectId, { metas, isLoaded: true });
    dispatch(projectId);
  },

  async createChat(projectId, name?, workflowId?, workflowStateKey?) {
    const chat = await createChat(projectId, name, workflowId, workflowStateKey);

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, { metas: [chat, ...current.metas], isLoaded: true });
      dispatch(projectId);
    }

    return chat;
  },

  async deleteChat(projectId, chatId) {
    await deleteChat(projectId, chatId);

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, {
        metas: current.metas.filter((c) => c.id !== chatId),
        isLoaded: true,
      });
      dispatch(projectId);
    }
  },

  async renameChat(projectId, chatId, name) {
    await this.updateChatMeta(projectId, chatId, { name });
  },

  async setChatDraft(projectId, chatId, draft, silent?: boolean) {
    await updateChatMeta(projectId, chatId, { draft }, silent);
  },

  async updateChatMeta(projectId, chatId, updates) {
    await updateChatMeta(projectId, chatId, updates);
  },

  async refresh(projectId) {
    const metas = await listChatMeta(projectId);
    state.set(projectId, { metas, isLoaded: true });
    dispatch(projectId);
    return metas;
  },

  subscribe(projectId, listener) {
    if (!listeners.has(projectId)) {
      listeners.set(projectId, new Set<Listener>());
    }
    listeners.get(projectId)!.add(listener);
    return () => {
      listeners.get(projectId)?.delete(listener);
    };
  },

  async getReservedTempFiles(projectId, chatId) {
    await chatStore.load(projectId);
    const metas = state.get(projectId)?.metas ?? [];
    const meta = metas.find((m) => m.id === chatId);
    return meta?.reservedTempFiles;
  },

  async saveSubagentMeta(projectId, chatId, subagentMeta) {
    const current = state.get(projectId);
    if (!current) return;

    const chat = current.metas.find((m) => m.id === chatId);
    if (!chat) return;

    const subagents = [...(chat.subagents || []).filter(s => s.id !== subagentMeta.id), subagentMeta];

    await this.updateChatMeta(projectId, chatId, { subagents });
  },

  async createNewVersionLog(projectId, chatId) {
    const current = state.get(projectId);
    if (!current) return generateGuid();

    const chat = current.metas.find((m) => m.id === chatId);
    if (!chat) return generateGuid();

    const versionHistory = [
      ...(chat.versionHistory || []),
      { logId: chat.logId, createdAt: chat.versionCreatedAt || chat.createdAt, updatedAt: chat.updatedAt },
    ];
    const newLogId = await chatLogsStore.createLog(projectId);

    await this.updateChatMeta(projectId, chatId, {
      logId: newLogId,
      versionHistory,
      versionCreatedAt: undefined,
    });

    return newLogId;
  },

  async appendMessage(projectId, chatId, logId, message) {
    await chatLogsStore.appendMessage(projectId, logId, message);
    await this.updateChatMeta(projectId, chatId, {});
  },
};

export { chatStore };

// --- approval queue functions ---

function queueApproval(projectId: string, request: ApprovalRequest): void {
  let projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) {
    projectQueue = {};
    approvalQueues.set(projectId, projectQueue);
  }
  const chatQueue = projectQueue[request.chatId] || [];
  chatQueue.push(request);
  projectQueue[request.chatId] = chatQueue;
  dispatchApprovalListeners(projectId);
}

function dequeueApproval(projectId: string, chatId: string, choice: number | void): void {
  const projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) return;
  const chatQueue = projectQueue[chatId];
  if (!chatQueue || chatQueue.length === 0) return;
  const request = chatQueue.shift()!;
  request.resolve(choice);
  if (chatQueue.length === 0) {
    delete projectQueue[chatId];
  }
  dispatchApprovalListeners(projectId);
}

function rejectPendingApproval(projectId: string, chatId: string, reason: unknown): void {
  const projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) return;
  const chatQueue = projectQueue[chatId];
  if (!chatQueue) return;
  for (const request of chatQueue) {
    request.reject(reason);
  }
  delete projectQueue[chatId];
  dispatchApprovalListeners(projectId);
}

function getPendingApprovalCount(projectId: string, chatId: string): number {
  const projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) return 0;
  return (projectQueue[chatId] || []).length;
}

function getFirstPendingApproval(projectId: string, chatId: string): ApprovalRequest | undefined {
  const projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) return undefined;
  const chatQueue = projectQueue[chatId];
  if (!chatQueue || chatQueue.length === 0) return undefined;
  return chatQueue[0];
}

function getFirstPendingApprovalAcrossAllChats(projectId: string): ApprovalRequest | undefined {
  const projectQueue = approvalQueues.get(projectId);
  if (!projectQueue) return undefined;
  for (const chatId of Object.keys(projectQueue)) {
    const chatQueue = projectQueue[chatId];
    if (chatQueue && chatQueue.length > 0) {
      return chatQueue[0];
    }
  }
  return undefined;
}

function subscribeApproval(projectId: string, listener: Listener): () => void {
  if (!approvalListeners.has(projectId)) {
    approvalListeners.set(projectId, new Set<Listener>());
  }
  approvalListeners.get(projectId)!.add(listener);
  return () => {
    approvalListeners.get(projectId)?.delete(listener);
  };
}

export {
  queueApproval,
  dequeueApproval,
  rejectPendingApproval,
  getPendingApprovalCount,
  getFirstPendingApproval,
  getFirstPendingApprovalAcrossAllChats,
  subscribeApproval,
};
