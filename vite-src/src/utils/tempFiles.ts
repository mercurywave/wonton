import { filesystem } from "./electronFs";
import { getProjectDataDir, TMP_DIR_NAME } from "./platformUtils";
import { chatStore } from "../store/chats";

/**
 * Reserves a unique temp file name and tracks it in chat meta.
 * Returns the unique file name that should be used for the file.
 */
export async function reserveTempFile(
  projectId: string,
  chatId: string,
  baseName?: string
): Promise<string> {
  const name = baseName ?? "temp.txt";
  const meta = chatStore.getChat(projectId, chatId);
  const existing = (meta?.reservedTempFiles) ?? [];

  const nextBase = (() => {
    const matching = existing.filter((r) => r.baseName === name);
    if (matching.length === 0) return name;
    const nextIndex = matching.length + 1;
    return `${name} (${nextIndex})`;
  })();

  const folders: string[] = [];
  const dataDir = await getProjectDataDir(projectId);
  if (dataDir) {
    folders.push(`${dataDir}/${TMP_DIR_NAME}`);
  }

  const uniqueName = await generateUniqueFileName(name, folders);

  const updated = [...existing, { baseName: nextBase, uniqueName }];
  await chatStore.updateChatMeta(projectId, chatId, {
    reservedTempFiles: updated,
    updatedAt: Date.now(),
  });

  return uniqueName;
}

/**
 * Writes content to a reserved temp file.
 */
export async function writeTempFile(
  projectId: string,
  uniqueName: string,
  content: string
): Promise<void> {
  const dataDir = await getProjectDataDir(projectId);
  if (!dataDir) {
    throw new Error("Could not determine project data directory");
  }

  const tmpPath = `${dataDir}/${TMP_DIR_NAME}/${uniqueName}`;
  await filesystem.createDirectory(`${dataDir}/${TMP_DIR_NAME}`);
  await filesystem.writeFile(tmpPath, content);
}

/**
 * Releases (deletes) a reserved temp file and removes it from chat meta.
 */
export async function releaseTempFile(
  projectId: string,
  chatId: string,
  uniqueName: string
): Promise<void> {
  const dataDir = await getProjectDataDir(projectId);
  if (dataDir) {
    const tmpPath = `${dataDir}/${TMP_DIR_NAME}/${uniqueName}`;
    try {
      await filesystem.remove(tmpPath);
    } catch {
      // File may have already been deleted
    }
  }

  const meta = chatStore.getChat(projectId, chatId);
  const existing = (meta?.reservedTempFiles) ?? [];
  const updated = existing.filter((r) => r.uniqueName !== uniqueName);

  await chatStore.updateChatMeta(projectId, chatId, {
    reservedTempFiles: updated.length > 0 ? updated : undefined,
    updatedAt: Date.now(),
  });
}

/**
 * Gets the full path to a reserved temp file.
 */
export async function getTempFilePath(
  projectId: string,
  uniqueName: string
): Promise<string | null> {
  const dataDir = await getProjectDataDir(projectId);
  if (!dataDir) return null;
  return `${dataDir}/${TMP_DIR_NAME}/${uniqueName}`;
}

/**
 * Generates a unique file name by checking existing files in the given folders.
 */
async function generateUniqueFileName(
  baseName: string,
  folders: string[],
): Promise<string> {
  // Import here to avoid circular dependency
  const { generateRandomFileName } = await import("./platformUtils");

  const allFiles = new Set<string>();
  for (const folder of folders) {
    if (!folder) continue;
    try {
      const entries = await filesystem.readDirectory(folder);
      for (const entry of entries) {
        allFiles.add(entry.entry);
      }
    } catch {
      // folder doesn't exist or isn't readable — skip it
    }
  }

  let fileName: string;
  do {
    fileName = generateRandomFileName(baseName);
  } while (allFiles.has(fileName));

  return fileName;
}
