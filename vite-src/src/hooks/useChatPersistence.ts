import { ChatMeta, ProjectMeta } from "../types/chat";
import {
  PROJ_FILE_NAME,
  CHATS_DIR_NAME,
  MSGS_DIR_NAME,
  DOCS_DIR_NAME,
  TMP_DIR_NAME,
  FLOWS_DIR_NAME,
  TOOLS_DIR_NAME,
  BATCHES_DIR_NAME,
  isBackendConnected,
  getProjectDataDir
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

export async function getProjectDataDirPath(projectId: string): Promise<string> {
  return getProjectDataDir(projectId);
}

export async function ensureChatFolder(projectId: string): Promise<void> {
  if (!isBackendConnected()) return;

  const projectDir = await getProjectDataDir(projectId);

  try {
    await filesystem.createDirectory(projectDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create project dir", err);
    }
  }

  const chatsDir = `${projectDir}/${CHATS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(chatsDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create chats dir", err);
    }
  }

  const msgsDir = `${projectDir}/${MSGS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(msgsDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create msgs dir", err);
    }
  }

  const docsDir = `${projectDir}/${DOCS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(docsDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create docs dir", err);
    }
  }

  const tmpDir = `${projectDir}/${TMP_DIR_NAME}`;
  try {
    await filesystem.createDirectory(tmpDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create tmp dir", err);
    }
  }

  const flowsDir = `${projectDir}/${FLOWS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(flowsDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create flows dir", err);
    }
  }

  const toolsDir = `${projectDir}/${TOOLS_DIR_NAME}`;
  try {
    await filesystem.createDirectory(toolsDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create tools dir", err);
    }
  }

  const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;
  try {
    await filesystem.createDirectory(batchesDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("ensureChatFolder: failed to create batches dir", err);
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

