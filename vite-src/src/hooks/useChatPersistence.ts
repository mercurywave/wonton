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
import { chatLogsStore } from "../store/chatLogs";

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

export async function resolveLogId(projectId: string, chatId: string): Promise<string> {
  if (!isNeutralinoConnected()) return chatId;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;

  try {
    const metaContent = await filesystem.readFile(`${chatsDir}/${chatId}.json`);
    const meta = JSON.parse(metaContent) as ChatMeta;
    return meta.logId || chatId;
  } catch {
    return chatId;
  }
}

export async function appendMessage(
  projectId: string,
  logId: string,
  message: ChatMessage,
  chatId?: string,
): Promise<void> {
  await chatLogsStore.appendMessage(projectId, logId, message);

  if (!chatId) {
    return;
  }

  if (!isNeutralinoConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;

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

    // Generate new log via store
    const newLogId = await chatLogsStore.createLog(projectId);

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


