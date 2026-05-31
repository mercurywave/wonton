import { ChatMeta } from "../types/chat";
import {
  CHATS_DIR_NAME,
  MSGS_DIR_NAME,
  TMP_DIR_NAME,
  PROJ_FILE_NAME,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/neuUtils";
import { filesystem } from "@neutralinojs/lib";

// --- persistence functions for chat metas ---

async function listChatMeta(projectId: string): Promise<ChatMeta[]> {
  if (!isNeutralinoConnected()) return [];

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
  if (!isNeutralinoConnected()) {
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
  };

  try {
    await filesystem.writeFile(
      `${chatsDir}/${chatId}.json`,
      JSON.stringify(chatMeta, null, 2)
    );
    await filesystem.writeFile(`${msgsDir}/${logId}.jsonl`, "");
  } catch (err) {
    console.error("createChat: failed to write chat files", err);
  }

  return chatMeta;
}

async function deleteChat(projectId: string, chatId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

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
          await filesystem.remove(`${msgsDir}/${subagent.logId}.jsonl`);
        }
      }
    }
  } catch (err) {
    console.error("deleteChat: failed to remove chat files", err);
  }
}

async function updateChatMeta(
  projectId: string,
  chatId: string,
  updates: Partial<Pick<ChatMeta, "name" | "updatedAt" | "activeModel" | "activeAgentId" | "workflowId" | "workflowStateKey" | "workflowData" | "draft" | "projectId">>
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;

  try {
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    const next = { ...meta, ...updates };
    await filesystem.writeFile(metaPath, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("updateChatMeta: failed to update chat meta", err);
  }
}

// --- store ---

type Listener = () => void;

interface ChatsState {
  metas: ChatMeta[];
  isLoaded: boolean;
}

interface ChatsStore {
  getChatMetas(projectId: string): ChatMeta[];
  load(projectId: string): Promise<void>;
  createChat(
    projectId: string,
    name?: string,
    workflowId?: string,
    workflowStateKey?: string
  ): Promise<ChatMeta>;
  deleteChat(projectId: string, chatId: string): Promise<void>;
  renameChat(projectId: string, chatId: string, name: string): Promise<void>;
  setChatDraft(projectId: string, chatId: string, draft: string): Promise<void>;
  updateChatMeta(
    projectId: string,
    chatId: string,
    updates: Partial<ChatMeta>
  ): Promise<void>;
  refresh(projectId: string): Promise<ChatMeta[]>;
  subscribe(projectId: string, listener: Listener): () => void;
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
    const now = Date.now();
    await updateChatMeta(projectId, chatId, { name, updatedAt: now });

    const current = state.get(projectId);
    if (current) {
      const metas = current.metas.map((c) =>
        c.id === chatId ? { ...c, name, updatedAt: now } : c
      );
      state.set(projectId, { metas, isLoaded: true });
      dispatch(projectId);
    }
  },

  async setChatDraft(projectId, chatId, draft) {
    const now = Date.now();
    await updateChatMeta(projectId, chatId, { draft, updatedAt: now });

    const current = state.get(projectId);
    if (current) {
      const metas = current.metas.map((c) =>
        c.id === chatId ? { ...c, draft, updatedAt: now } : c
      );
      state.set(projectId, { metas, isLoaded: true });
      dispatch(projectId);
    }
  },

  async updateChatMeta(projectId, chatId, updates) {
    const now = Date.now();
    await updateChatMeta(projectId, chatId, updates);

    const current = state.get(projectId);
    if (current) {
      const metas = current.metas.map((c) =>
        c.id === chatId ? { ...c, ...updates, updatedAt: now } : c
      );
      state.set(projectId, { metas, isLoaded: true });
      dispatch(projectId);
    }
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
};

export { chatStore };
