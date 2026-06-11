/// <reference types="vite/client" />

interface ElectronAPI {
  filesystem: {
    createDirectory: (dirPath: string) => Promise<void>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (filePath: string, content: string) => Promise<void>;
    appendFile: (filePath: string, content: string) => Promise<void>;
    remove: (filePath: string) => Promise<void>;
    readDirectory: (dirPath: string) => Promise<{ entry: string }[]>;
    getStats: (filePath: string) => Promise<{ size: number; isDirectory: boolean; isFile: boolean; modifiedTime: number; createdTime: number }>;
    getJoinedPath: (basePath: string, relativePath: string) => Promise<string>;
    getAbsolutePath: (filePath: string) => Promise<string>;
    getRelativePath: (fromPath: string, toPath: string) => Promise<string>;
    getNormalizedPath: (filePath: string) => Promise<string>;
    createWatcher: (dirPath: string) => Promise<{ watcherId: string }>;
    removeWatcher: (watcherId: string) => Promise<void>;
  };
  os: {
    showFolderDialog: (title: string) => Promise<string>;
    open: (folderPath: string) => Promise<void>;
    execCommand: (command: string, cwd?: string) => Promise<{ stdout: string; stderr: string; status: number | null; signal?: string; killed?: boolean }>;
  };
  computer: {
    getOSInfo: () => Promise<{ name: string; arch: string; platform: string; version: string; type: string }>;
  };
  dataDir: {
    getAppPath: () => Promise<string>;
    getHomeDir: () => Promise<string>;
    getPlatform: () => Promise<string>;
  };
  events: {
    on: (eventName: string, callback: (event: any, ...args: any[]) => void) => () => void;
    off: (eventName: string, callback: (event: any, ...args: any[]) => void) => void;
  };
}

interface Window {
  electronAPI: ElectronAPI;
}
