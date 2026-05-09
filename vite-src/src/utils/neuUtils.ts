import { computer, os } from "@neutralinojs/lib";

export const DATA_DIR_NAME = "wonton";
export const PROJ_FILE_NAME = "proj.json";
export const CHATS_DIR_NAME = "chats";
export const MSGS_DIR_NAME = "msgs";
export const PROJECTS_FILE_NAME = "projects.json";
export const DEFAULT_PROJECT_ID = "default";

export function isNeutralinoConnected() {
  return window.NL_MODE !== undefined;
}

export function generateGuid(): string {
  return crypto.randomUUID();
}

export async function getProjectDataDir(projectId: string): Promise<string> {
  if (!isNeutralinoConnected()) {
    return "";
  }
  const platform = (await computer.getOSInfo()).name.toLowerCase();

  let dataDir: string;
  if (platform.includes("windows")) {
    const local = await os.getEnv("LOCALAPPDATA");
    dataDir = `${local}\\${DATA_DIR_NAME}`;
  } else if (platform.includes("mac")) {
    const home = await os.getEnv("HOME");
    dataDir = `${home}/Library/Application Support/${DATA_DIR_NAME}`;
  } else {
    const xdg = await os.getEnv("XDG_DATA_HOME");
    if (xdg) {
      dataDir = `${xdg}/${DATA_DIR_NAME}`;
    } else {
      const home = await os.getEnv("HOME");
      dataDir = `${home}/.local/share/${DATA_DIR_NAME}`;
    }
  }
  return `${dataDir}/${projectId}`;
}
