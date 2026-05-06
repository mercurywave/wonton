import { ChatMeta, ProjectMeta } from "../types/chat";
import { ChatMessage } from "../types/chat";
import {
  PROJ_FILE_NAME,
  CHATS_DIR_NAME,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "./neuUtils";
import { filesystem } from "@neutralinojs/lib";

export async function getProjectDataDirPath(projectId: string): Promise<string> {
  return getProjectDataDir(projectId);
}

export async function ensureChatFolder(projectId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);

  try {
    await filesystem.createDirectory(projectDir);
  } catch (err) {
    console.error("ensureChatFolder: failed to create project dir", err);
  }

  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;
  try {
    await filesystem.readFile(projPath);
  } catch {
    const meta: ProjectMeta = {};
    try {
      await filesystem.writeFile(projPath, JSON.stringify(meta, null, 2));
    } catch (err) {
      console.error("ensureChatFolder: failed to write proj.json", err);
    }
  }

  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(chatsDir);
  } catch (err) {
    console.error("ensureChatFolder: failed to create chats dir", err);
  }

  const chatId = generateGuid();
  const chatMeta: ChatMeta = {
    id: chatId,
    name: "Initial",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  try {
    await filesystem.writeFile(
      `${chatsDir}/${chatId}.json`,
      JSON.stringify(chatMeta, null, 2)
    );
    await filesystem.writeFile(`${chatsDir}/${chatId}.jsonl`, "");
  } catch (err) {
    console.error("ensureChatFolder: failed to create initial chat", err);
    return;
  }

  try {
    const content = await filesystem.readFile(projPath);
    const existingMeta: ProjectMeta = JSON.parse(content);
    existingMeta.activeChatId = chatId;
    await filesystem.writeFile(projPath, JSON.stringify(existingMeta, null, 2));
  } catch (err) {
    console.error("ensureChatFolder: failed to set activeChatId", err);
  }
}

export async function listChatMeta(projectId: string): Promise<ChatMeta[]> {
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

export async function createChat(
  projectId: string,
  name?: string
): Promise<ChatMeta> {
  if (!isNeutralinoConnected()) {
    const chatId = generateGuid();
    return {
      id: chatId,
      name: name || `Chat ${new Date().toLocaleTimeString()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;

  const chatId = generateGuid();
  const now = Date.now();

  const chatMeta: ChatMeta = {
    id: chatId,
    name: name || `Chat ${new Date().toLocaleTimeString()}`,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await filesystem.writeFile(
      `${chatsDir}/${chatId}.json`,
      JSON.stringify(chatMeta, null, 2)
    );
    await filesystem.writeFile(`${chatsDir}/${chatId}.jsonl`, "");
  } catch (err) {
    console.error("createChat: failed to write chat files", err);
  }

  try {
    const projPath = `${projectDir}/${PROJ_FILE_NAME}`;
    const content = await filesystem.readFile(projPath);
    const existingMeta: ProjectMeta = JSON.parse(content);
    existingMeta.activeChatId = chatId;
    await filesystem.writeFile(projPath, JSON.stringify(existingMeta, null, 2));
  } catch (err) {
    console.error("createChat: failed to update activeChatId", err);
  }

  return chatMeta;
}

export async function deleteChat(projectId: string, chatId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;

  try {
    await filesystem.remove(`${chatsDir}/${chatId}.json`);
  } catch (err) {
    console.error("deleteChat: failed to remove meta file", err);
  }

  try {
    await filesystem.remove(`${chatsDir}/${chatId}.jsonl`);
  } catch (err) {
    console.error("deleteChat: failed to remove jsonl file", err);
  }
}

export async function loadMessages(projectId: string, chatId: string): Promise<ChatMessage[]> {
  if (!isNeutralinoConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const jsonlPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.jsonl`;

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

export async function appendMessage(
  projectId: string,
  chatId: string,
  message: ChatMessage
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const jsonlPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.jsonl`;

  try {
    const line = JSON.stringify(message) + "\n";
    await filesystem.appendFile(jsonlPath, line);
  } catch (err) {
    console.error("appendMessage: failed to append to jsonl", err);
  }

  try {
    const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    meta.updatedAt = Date.now();
    await filesystem.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error("appendMessage: failed to update chat meta", err);
  }
}

export async function updateChatMeta(
  projectId: string,
  chatId: string,
  updates: Partial<Pick<ChatMeta, "name" | "updatedAt" | "activeModel">>
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

export async function clearChat(projectId: string, chatId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const jsonlPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.jsonl`;

  try {
    await filesystem.writeFile(jsonlPath, "");
  } catch (err) {
    console.error("clearChat: failed to truncate jsonl", err);
  }

  try {
    const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    meta.updatedAt = Date.now();
    await filesystem.writeFile(metaPath, JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error("clearChat: failed to update chat meta", err);
  }
}

export async function deleteProjectFolder(projectId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);

  try {
    const projPath = `${projectDir}/${PROJ_FILE_NAME}`;
    await filesystem.remove(projPath);
    const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
    const entries = await filesystem.readDirectory(chatsDir);
    for (const entry of entries) {
      await filesystem.remove(`${chatsDir}/${entry.entry}`);
    }
    await filesystem.remove(chatsDir);
  } catch (err) {
    console.error("deleteProjectFolder: failed to remove project folder", err);
  }
}

export async function updateProjectMeta(
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
    console.error("updateProjectMeta: failed to write proj.json", err);
  }
}

export async function loadProjectMeta(projectId: string): Promise<ProjectMeta> {
  if (!isNeutralinoConnected()) return {};

  const projectDir = await getProjectDataDir(projectId);
  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;

  try {
    const content = await filesystem.readFile(projPath);
    return JSON.parse(content) as ProjectMeta;
  } catch {
    return {};
  }
}
