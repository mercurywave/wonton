import path from "path";
import os from "os";
import { filesystem } from "./electronFs";
import { TempFileReservation } from "../types/chat";

// Platform-neutral data directory resolution

export const DATA_DIR_NAME = "wonton";
export const PROJ_FILE_NAME = "proj.json";
export const CHATS_DIR_NAME = "chats";
export const MSGS_DIR_NAME = "msgs";
export const DOCS_DIR_NAME = "docs";
export const DOCS_FOLDER_OVERRIDE = "docs";
export const TMP_DIR_NAME = "tmp";
export const PROJECTS_FILE_NAME = "projects.json";
export const AGENTS_FILE_NAME = "agents.json";
export const FLOWS_DIR_NAME = "flows";
export const TASKS_DIR_NAME = "tasks";
export const DEFAULT_PROJECT_ID = "default";

let _cachedPlatform: string | undefined;

async function getPlatformFromMain(): Promise<string> {
  if (_cachedPlatform) return _cachedPlatform;
  if (typeof window !== "undefined" && "electronAPI" in window) {
    _cachedPlatform = await window.electronAPI.dataDir.getPlatform();
    return _cachedPlatform;
  }
  // Fallback for non-Electron environments
  _cachedPlatform = process.platform;
  return _cachedPlatform;
}

export async function getPlatform(): Promise<string> {
  return getPlatformFromMain();
}

export function isWindowsSync(): boolean {
  if (!_cachedPlatform) {
    // Default to false (not Windows) when platform not yet known
    return false;
  }
  return _cachedPlatform === "win32";
}

export async function isWindows(): Promise<boolean> {
  return (await getPlatformFromMain()) === "win32";
}

async function joinPath(...parts: string[]): Promise<string> {
  return filesystem.joinPath(...parts);
}

export async function getRootDataDir(): Promise<string> {
  let dataDir: string;
  const platform = await getPlatformFromMain();

  if (typeof window !== "undefined" && "electronAPI" in window) {
    const appPath = await window.electronAPI.dataDir.getAppPath();
    dataDir = await joinPath(appPath, DATA_DIR_NAME);
  } else if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    dataDir = path.join(localAppData, DATA_DIR_NAME);
  } else if (platform === "darwin") {
    const home = os.homedir();
    dataDir = path.join(home, "Library", "Application Support", DATA_DIR_NAME);
  } else {
    // Linux
    const xdgDataHome = process.env.XDG_DATA_HOME;
    if (xdgDataHome) {
      dataDir = path.join(xdgDataHome, DATA_DIR_NAME);
    } else {
      const home = os.homedir();
      dataDir = path.join(home, ".local", "share", DATA_DIR_NAME);
    }
  }

  return dataDir;
}

export async function getProjectDataDir(projectId: string): Promise<string> {
  const rootDir = await getRootDataDir();
  return await joinPath(rootDir, projectId);
}

export function isBackendConnected(): boolean {
  return typeof window !== "undefined" && "electronAPI" in window;
}

export function generateGuid(): string {
  return crypto.randomUUID();
}

const WORDS = [
  "cat", "dog", "fox", "bear", "wolf", "lion", "frog", "bird", "duck", "deer",
  "swan", "crab", "seal", "whale", "shark", "eagle", "hawk", "owl", "bat", "ant",
  "bee", "fly", "wasp", "snail", "fish", "cod", "bass", "trout", "carp", "perch",
  "panda", "koala", "pug", "cow", "pig", "sheep", "goat", "horse", "zebra", "moose",
  "elk", "emu", "ibis", "lamb", "lynx", "mole", "newt", "otter", "pony", "raven",
  "apple", "grape", "lemon", "melon", "mango", "peach", "pear", "plum", "prune",
  "bread", "crust", "grain", "honey", "melt", "oat", "rice", "soda", "sugar",
  "toast", "wheat", "water", "juice", "cider", "cumin", "fennel", "ginger",
  "herb", "kale", "mint", "nut", "pea", "salt", "tea", "yeast", "zest",
  "basil", "corn", "dill", "fig", "olive", "pepper", "sage", "taro", "yam",
  "beet", "bean", "chard", "chili", "clove", "cress", "fava", "leek", "okra",
  "parsley", "radish", "squash", "turnip", "walnut",
  "amber", "azure", "blaze", "brave", "bright", "cedar", "chill", "clear",
  "cloud", "cool", "crisp", "crowd", "curly", "dusty", "eager", "ember", "faint",
  "frost", "fresh", "fuzzy", "gold", "grace", "gruff", "happy", "haste",
  "hazel", "jolly", "juicy", "keen", "lilac", "lunar", "magic", "misty",
  "mossy", "noble", "ocean", "oxide", "pale", "pearl", "proud", "puff", "quartz",
  "rapid", "rich", "rose", "ruby", "rusty", "sable", "sharp", "shy", "silver",
  "smoke", "smooth", "snowy", "spicy", "spry", "sunny", "swift", "tawny",
  "thick", "tidal", "tidy", "tough", "twist", "vivid", "warm", "wavy", "wild",
  "witty", "woven", "wrist", "young", "zeal", "zephyr",
  "blink", "bliss", "bloom", "bounce", "break", "burn", "bush", "carry", "charm",
  "chase", "chime", "climb", "coil", "crash", "crawl", "creep", "curve", "dance",
  "drift", "drop", "drum", "dust", "emerge", "fade", "flow", "fold", "glow",
  "grasp", "grow", "hush", "jump", "kiss", "leap", "lift", "link", "lurk",
  "mark", "mist", "mow", "nail", "nod", "paint", "peel", "pierce",
  "pint", "pluck", "pour", "pry", "pulse", "pull", "purr", "race", "raft",
  "rake", "ring", "rise", "rock", "roam", "root", "rope", "rust", "sail",
  "scan", "sew", "shake", "shape", "shed", "shift", "shine", "shiver", "shout",
  "shrug", "sift", "sign", "sing", "sink", "slide", "smell", "snap", "snow",
  "soak", "sob", "spin", "spit", "spray", "sprout", "stack", "sting",
  "stir", "stow", "strain", "stream", "strip", "stroke", "strum", "stuff",
  "stump", "stun", "submerge", "suck", "sum", "sweep", "swim", "swing",
  "taste", "tear", "tell", "thaw", "think", "tilt", "tint", "tire",
  "trace", "trade", "train", "tray", "tread", "trim", "trot", "tumble",
  "twine", "twirl", "type", "unwind", "veil", "vent", "view", "vex", "wake",
  "wane", "weave", "weed", "whip", "whisk", "wind", "wipe", "wish", "wring",
  "yawn", "yield", "zip", "zoom",
];

function pickRandom(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateRandomFileName(baseName: string): string {
  const word1 = pickRandom(WORDS);
  let word2 = pickRandom(WORDS);
  while (word2 === word1) {
    word2 = pickRandom(WORDS);
  }
  return `${word1}-${word2}-${baseName}`;
}

export async function generateUniqueFileName(
  baseName: string,
  folders: string[],
): Promise<string> {
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

export interface TempFilePathResult {
  redirected: true;
  tmpPath: string;
  virtualPath: string;
}

export interface NoRedirectResult {
  redirected: false;
}

export type ResolveTempPathResult = TempFilePathResult | NoRedirectResult;

export async function resolveTempFilePath(
  path: string,
  projectId: string | undefined,
  reservedTempFiles: TempFileReservation[] | undefined,
): Promise<ResolveTempPathResult> {
  if (!projectId || !reservedTempFiles || reservedTempFiles.length === 0) {
    return { redirected: false };
  }

  const normalizedPath = path.replace(/\\/g, "/");
  const fileName = normalizedPath.split("/").pop() || normalizedPath;

  const reservation = reservedTempFiles.find((r) => r.uniqueName === fileName);
  if (!reservation) {
    return { redirected: false };
  }

  const dataDir = await getProjectDataDir(projectId);
  if (!dataDir) {
    return { redirected: false };
  }

  const tmpPath = `${dataDir}/${TMP_DIR_NAME}/${reservation.uniqueName}`;

  return {
    redirected: true,
    tmpPath,
    virtualPath: fileName,
  };
}
