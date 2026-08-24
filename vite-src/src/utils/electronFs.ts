// electronFs.ts - Filesystem abstraction that works in both Electron and browser mode

interface FsStats {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modifiedTime: number;
  createdTime: number;
}

interface FsEntry {
  entry: string;
}

interface WatcherResult {
  watcherId: string;
}

// Check if we're running in Electron
function isElectron(): boolean {
  return typeof window !== "undefined" && "electronAPI" in window;
}

function throwIfNotElectron() {
  if (!isElectron()) {
    throw new Error("filesystem operations not available outside Electron");
  }
}

function assertValidPath(value: string | undefined | null, kind: "file" | "directory") {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${kind === "directory" ? "Directory" : "File"} path is required`);
  }
}

export const filesystem = {
  async createDirectory(dirPath: string): Promise<void> {
    assertValidPath(dirPath, "directory");
    throwIfNotElectron();
    await window.electronAPI.filesystem.createDirectory(dirPath);
  },

  async readFile(filePath: string): Promise<string> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.readFile(filePath);
  },

  async tryReadFile(filePath: string): Promise<string | null> {
    if (!filePath || !filePath.trim()) return null;
    throwIfNotElectron();
    return window.electronAPI.filesystem.tryReadFile(filePath);
  },

  async doesFileExist(filePath: string): Promise<boolean> {
    if (!filePath || !filePath.trim()) return false;
    throwIfNotElectron();
    return window.electronAPI.filesystem.doesFileExist(filePath);
  },

  async writeFile(filePath: string, content: string): Promise<void> {
    throwIfNotElectron();
    await window.electronAPI.filesystem.writeFile(filePath, content);
  },

  async appendFile(filePath: string, content: string): Promise<void> {
    throwIfNotElectron();
    await window.electronAPI.filesystem.appendFile(filePath, content);
  },

  async remove(filePath: string): Promise<void> {
    throwIfNotElectron();
    await window.electronAPI.filesystem.remove(filePath);
  },

  async readDirectory(dirPath: string): Promise<FsEntry[]> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.readDirectory(dirPath);
  },

  async getStats(filePath: string): Promise<FsStats> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.getStats(filePath);
  },

  async getJoinedPath(basePath: string, relativePath: string): Promise<string> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.getJoinedPath(basePath, relativePath);
  },

  async joinPath(...parts: string[]): Promise<string> {
    throwIfNotElectron();
    let result = parts[0];
    for (let i = 1; i < parts.length; i++) {
      result = await window.electronAPI.filesystem.getJoinedPath(result, parts[i]);
    }
    return result;
  },

  async getAbsolutePath(filePath: string): Promise<string> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.getAbsolutePath(filePath);
  },

  async getRelativePath(fromPath: string, toPath: string): Promise<string> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.getRelativePath(fromPath, toPath);
  },

  async getNormalizedPath(filePath: string): Promise<string> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.getNormalizedPath(filePath);
  },

  async createWatcher(dirPath: string): Promise<WatcherResult> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.createWatcher(dirPath);
  },

  async removeWatcher(watcherId: string): Promise<void> {
    throwIfNotElectron();
    await window.electronAPI.filesystem.removeWatcher(watcherId);
  },

  async watchDir(dirPath: string): Promise<WatcherResult> {
    throwIfNotElectron();
    return window.electronAPI.filesystem.createWatcher(dirPath);
  },
};
