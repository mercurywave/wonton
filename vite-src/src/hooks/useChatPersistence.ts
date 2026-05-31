import { ChatMeta, ProjectMeta, SubagentMeta } from "../types/chat";
import { ChatMessage } from "../types/chat";
import {
  PROJ_FILE_NAME,
  CHATS_DIR_NAME,
  MSGS_DIR_NAME,
  DOCS_DIR_NAME,
  TMP_DIR_NAME,
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

  const docsDir = `${projectDir}/${DOCS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(docsDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("ensureChatFolder: failed to create docs dir", err);
    }
  }

  const tmpDir = `${projectDir}/${TMP_DIR_NAME}`;
  try {
    await filesystem.createDirectory(tmpDir);
  } catch (err: any) {
    if (err.code !== "NE_FS_DIRCRER") {
      console.error("ensureChatFolder: failed to create tmp dir", err);
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

  const meta: ProjectMeta = { 
    createdAt: Date.now(),
  };
  try {
    await filesystem.writeFile(projPath, JSON.stringify(meta, null, 2));
  } catch (err) {
    console.error("ensureChatFolder: failed to write proj.json", err);
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

export async function loadMessagesByLogId(projectId: string, logId: string): Promise<ChatMessage[]> {
  if (!isNeutralinoConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  try {
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

export async function createNewVersionLog(
  projectId: string,
  chatId: string
): Promise<string> {
  if (!isNeutralinoConnected()) {
    const newLogId = generateGuid();
    return newLogId;
  }

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;

  const metaPath = `${chatsDir}/${chatId}.json`;

  try {
    const content = await filesystem.readFile(metaPath);
    const meta = JSON.parse(content) as ChatMeta;
    const now = Date.now();

    // Archive current version
    const versionHistory = meta.versionHistory || [];
    versionHistory.push({
      logId: meta.logId,
      createdAt: meta.versionCreatedAt || meta.createdAt,
      updatedAt: meta.updatedAt,
    });
    meta.versionHistory = versionHistory;

    // Generate new log
    const newLogId = generateGuid();
    await filesystem.writeFile(`${msgsDir}/${newLogId}.jsonl`, "");

    // Update meta
    meta.logId = newLogId;
    meta.versionCreatedAt = undefined;
    meta.updatedAt = now;

    await filesystem.writeFile(metaPath, JSON.stringify(meta, null, 2));

    return newLogId;
  } catch (err) {
    console.error("createNewVersionLog: failed to create new version", err);
    throw err;
  }
}

export async function loadDisabledFlows(projectId: string): Promise<string[]> {
  if (!isNeutralinoConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const projPath = `${projectDir}/${PROJ_FILE_NAME}`;

  try {
    const content = await filesystem.readFile(projPath);
    const meta = JSON.parse(content) as ProjectMeta;
    return meta.disabledFlows || [];
  } catch {
    return [];
  }
}

export async function updateDisabledFlows(
  projectId: string,
  disabledFlows: string[]
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
    const next = { ...existingMeta, disabledFlows };
    await filesystem.writeFile(projPath, JSON.stringify(next, null, 2));
  } catch (err) {
    console.error("updateDisabledFlows: failed to write proj.json", err);
  }
}
