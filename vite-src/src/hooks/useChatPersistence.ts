import { ChatMeta, ProjectMeta, SubagentMeta } from "../types/chat";
import { ChatMessage } from "../types/chat";
import {
  PROJ_FILE_NAME,
  CHATS_DIR_NAME,
  MSGS_DIR_NAME,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/neuUtils";
import { filesystem } from "@neutralinojs/lib";

export async function getProjectDataDirPath(projectId: string): Promise<string> {
  return getProjectDataDir(projectId);
}

export async function ensureChatFolder(projectId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);

  try {
    await filesystem.createDirectory(projectDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("ensureChatFolder: failed to create project dir", err);
    }
  }

  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(chatsDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("ensureChatFolder: failed to create chats dir", err);
    }
  }

  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(msgsDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("ensureChatFolder: failed to create msgs dir", err);
    }
  }

  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;
  try {
    await filesystem.readFile(projPath);
    return;
  } catch { }

  // I seemingly can't avoid race conditions that lead to double files
  // so write the first chat using the project ID to avoid a double entry
  const chatId = projectId;
  const logId = projectId;
  const chatMeta: ChatMeta = {
    id: chatId,
    projectId: projectId,
    name: "Initial",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    logId: logId,
  };

  try {
    await filesystem.writeFile(
      `${chatsDir}/${chatId}.json`,
      JSON.stringify(chatMeta, null, 2)
    );
    await filesystem.writeFile(`${msgsDir}/${logId}.jsonl`, "");
  } catch (err) {
    console.error("ensureChatFolder: failed to create initial chat", err);
    return;
  }

  const meta: ProjectMeta = { activeChatId: chatId };
  try {
    await filesystem.writeFile(projPath, JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error("ensureChatFolder: failed to write proj.json", err);
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

export async function createChat(
  projectId: string,
  name?: string
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
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  try {
    const content = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(content) as ChatMeta;
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

export async function loadMessages(projectId: string, chatId: string, chatExecutionIds?: Map<string, string>): Promise<ChatMessage[]> {
  if (!isNeutralinoConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  try {
    const metaContent = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(metaContent) as ChatMeta;
    const logId = meta.logId || chatId;
    const jsonlPath = `${msgsDir}/${logId}.jsonl`;

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
    if(chatExecutionIds?.has(chatId)) {
      messages.push({
        id: chatExecutionIds.get(chatId)!,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: [],
      })
    }
    return messages;
  } catch {
    return [];
  }
}

export async function appendMessage(
  projectId: string,
  logId: string,
  message: ChatMessage,
  chatId?: string,
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  const jsonlPath = `${msgsDir}/${logId}.jsonl`;
  const line = JSON.stringify(message) + "\n";
  await filesystem.appendFile(jsonlPath, line);

  if (!chatId) {
    return;
  }

  try {
    const metaContent = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(metaContent) as ChatMeta;
    meta.updatedAt = Date.now();
    await filesystem.writeFile(`${chatsDir}/${chatId}.json`, JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error("appendMessage: failed to update chat meta", err);
  }
}

export async function updateChatMeta(
  projectId: string,
  chatId: string,
  updates: Partial<Pick<ChatMeta, "name" | "updatedAt" | "activeModel" | "activeAgentId" | "draft" | "projectId">>
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

export async function updateChatDraft(
  projectId: string,
  chatId: string,
  draft: string
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;

  try {
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    const next = { ...meta, draft, updatedAt: Date.now() };
    await filesystem.writeFile(metaPath, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("updateChatDraft: failed to update draft", err);
  }
}

export async function clearChat(projectId: string, chatId: string): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  try {
    const metaContent = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(metaContent) as ChatMeta;
    const logId = meta.logId || chatId;
    const jsonlPath = `${msgsDir}/${logId}.jsonl`;
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
    const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
    const msgEntries = await filesystem.readDirectory(msgsDir);
    for (const entry of msgEntries) {
      await filesystem.remove(`${msgsDir}/${entry.entry}`);
    }
    await filesystem.remove(msgsDir);
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

export async function createSubagentLog(
  projectId: string,
  _chatId: string,
  _agentId: string,
  _query: string
): Promise<{ subagentId: string; logId: string }> {
  if (!isNeutralinoConnected()) {
    const subagentId = generateGuid();
    const logId = generateGuid();
    return { subagentId, logId };
  }

  const projectDir = await getProjectDataDir(projectId);
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  const subagentId = generateGuid();
  const logId = generateGuid();

  try {
    await filesystem.writeFile(`${msgsDir}/${logId}.jsonl`, "");
  } catch (err) {
    console.error("createSubagentLog: failed to create subagent jsonl", err);
  }

  return { subagentId, logId };
}

export async function saveSubagentMeta(
  projectId: string,
  chatId: string,
  subagentMeta: SubagentMeta
): Promise<void> {
  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const metaPath = `${projectDir}/${CHATS_DIR_NAME}/${chatId}.json`;

  try {
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    const subagents = meta.subagents || [];
    const idx = subagents.findIndex(s => s.id === subagentMeta.id);
    if (idx !== -1) {
      subagents[idx] = subagentMeta;
    }
    else {
      subagents.push(subagentMeta);
    }
    await filesystem.writeFile(metaPath, JSON.stringify({ ...meta, subagents }, null, 2));
  } catch (err) {
    console.error("saveSubagentMeta: failed to save subagent meta", err);
  }
}
