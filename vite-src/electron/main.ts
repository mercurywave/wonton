import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from "electron";
import path from "path";
import { promises as fs } from "fs";
import { exec } from "child_process";
import os from "os";
import { promisify } from "util";

const execAsync = promisify(exec);

// Determine if we're in dev mode
const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 400,
    minHeight: 200,
    title: "Wonton",
    icon: path.resolve(__dirname, "../../public/takeout.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "..", "..", "dist", "index.html"));
  }

  return win;
}

let mainWindow: BrowserWindow;

// Wait for app to be ready
app.whenReady().then(() => {
  mainWindow = createWindow();

  purgeWontonTmpDirectories();
  setInterval(() => {
    purgeWontonTmpDirectories();
  }, TMP_PURGE_INTERVAL_MS);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC handlers

// filesystem module
const filesystemHandlers: Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any> = {
  async createDirectory(_event, dirPath) {
    if (typeof dirPath !== "string" || dirPath.trim() === "") {
      throw new Error("Directory path is required");
    }

    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (err: any) {
      const error = new Error(err.message || "Failed to create directory");
      (error as any).code = err.code || "E_FS_CREATE_DIR";
      throw error;
    }
  },

  async tryReadFile(_event, filePath) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      return null;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (err: any) {
      if (err && err.code === "ENOENT") {
        return null;
      }
      const error = new Error(err.message || "Failed to read file");
      (error as any).code = err.code || "E_FS_READ";
      throw error;
    }
  },

  async readFile(_event, filePath) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      throw new Error("File path is required");
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (err: any) {
      const error = new Error(err.message || "Failed to read file");
      (error as any).code = err.code || "E_FS_READ";
      throw error;
    }
  },

  async doesFileExist(_event, filePath) {
    if (typeof filePath !== "string" || filePath.trim() === "") {
      return false;
    }

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  },

  async writeFile(_event, filePath, content) {
    try {
      await fs.writeFile(filePath, content, "utf-8");
    } catch (err: any) {
      const error = new Error(err.message || "Failed to write file");
      (error as any).code = err.code || "E_FS_WRITE";
      throw error;
    }
  },

  async appendFile(_event, filePath, content) {
    try {
      await fs.appendFile(filePath, content, "utf-8");
    } catch (err: any) {
      const error = new Error(err.message || "Failed to append to file");
      (error as any).code = err.code || "E_FS_APPEND";
      throw error;
    }
  },

  async remove(_event, filePath) {
    try {
      await fs.rm(filePath, { recursive: false, force: true });
    } catch (err: any) {
      const error = new Error(err.message || "Failed to remove file");
      (error as any).code = err.code || "E_FS_REMOVE";
      throw error;
    }
  },

  async readDirectory(_event, dirPath) {
    try {
      const entries = await fs.readdir(dirPath);
      return entries.map((entry: string) => ({ entry }));
    } catch (err: any) {
      const error = new Error(err.message || "Failed to read directory");
      (error as any).code = err.code || "E_FS_READ_DIR";
      throw error;
    }
  },

  async getStats(_event, filePath) {
    try {
      const stat = await fs.stat(filePath);
      return {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        modifiedTime: stat.mtimeMs,
        createdTime: stat.birthtimeMs,
      };
    } catch (err: any) {
      const error = new Error(err.message || "Failed to stat file");
      (error as any).code = err.code || "E_FS_STATS";
      throw error;
    }
  },

  async getJoinedPath(_event, basePath, relativePath) {
    return path.join(basePath, relativePath);
  },

  async getAbsolutePath(_event, filePath) {
    return path.resolve(filePath);
  },

  async getRelativePath(_event, fromPath, toPath) {
    return path.relative(fromPath, toPath);
  },

  async getNormalizedPath(_event, filePath) {
    return path.normalize(filePath);
  },

  async createWatcher(_event, dirPath) {
    // File watchers are handled in the renderer process via IPC
    return { watcherId: Date.now() };
  },

  async removeWatcher(_event, _watcherId) {
    // No-op: watchers are managed in renderer
  },
};

// Register filesystem IPC handlers
for (const [method, handler] of Object.entries(filesystemHandlers)) {
  ipcMain.handle(`filesystem:${method}`, handler);
}

// os module
const osHandlers: Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any> = {
  async showFolderDialog(_event, title) {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
      title,
    });
    if (!result || result.filePaths.length === 0) return "";
    return result.filePaths[0];
  },

  async showSaveDialog(_event, title, defaultPath) {
    const result = await dialog.showSaveDialog({
      title,
      defaultPath: defaultPath || undefined,
    });
    if (result.canceled || !result.filePath) return "";
    return result.filePath;
  },

  async open(_event, folderPath) {
    return shell.openPath(folderPath);
  },

  async downloadFile(_event, url, targetPath) {
    if (typeof url !== "string" || !url.trim()) {
      throw new Error("Download URL is required");
    }
    if (typeof targetPath !== "string" || !targetPath.trim()) {
      throw new Error("Download destination is required");
    }

    const response = await fetch(url);
    if (!response.ok) {
      const payload = await response.text().catch(() => "");
      throw new Error(payload || `Download failed (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(targetPath, buffer);
    return targetPath;
  },

  async execCommand(_event, command, cwd) {
    try {
      const result = await execAsync(command, { cwd });
      return { stdout: result.stdout, stderr: result.stderr, status: 0 };
    } catch (err: any) {
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", status: (err.code || err.status) ?? 1, signal: err.signal, killed: err.killed };
    }
  },
};

// Register os IPC handlers
for (const [method, handler] of Object.entries(osHandlers)) {
  ipcMain.handle(`os:${method}`, handler);
}

// computer module
const computerHandlers: Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any> = {
  async getOSInfo(_event) {
    return {
      name: process.platform,
      arch: os.arch(),
      platform: process.platform,
      version: os.release(),
      type: os.type(),
    };
  },
};

// Register computer IPC handlers
for (const [method, handler] of Object.entries(computerHandlers)) {
  ipcMain.handle(`computer:${method}`, handler);
}

// dataDir module - path resolution that requires Node.js access
const dataDirHandlers: Record<string, (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any> = {
  async getAppPath(_event) {
    return app.getPath("userData");
  },

  async getHomeDir(_event) {
    return os.homedir();
  },

  async getPlatform(_event) {
    return process.platform;
  },
};

// Register dataDir IPC handlers
for (const [method, handler] of Object.entries(dataDirHandlers)) {
  ipcMain.handle(`dataDir:${method}`, handler);
}

// notifications module
const notificationIcon = path.resolve(__dirname, "../../public/takeout.png");

ipcMain.handle("notification:show", async (_event, title, body, behavior) => {
  if(!Notification.isSupported()) {
    console.error("notifications not supported on platform");
    return; 
  }
  let notify = new Notification({
    title,
    body,
    icon: notificationIcon,
  });
  notify.on('click', () => {
    mainWindow.moveTop();
    mainWindow.focus();
    notify.close();
  });
  notify.show();
});

// events module - file watching
// The renderer will request a file watch via 'watch:start', and the main process
// will forward 'watch:change' events back to the renderer via the webContents.
const watchedFiles = new Map<string, { watcher: import("fs").FSWatcher; win: BrowserWindow }>();

import { watch } from "fs";

ipcMain.handle("watch:start", async (event, dirPath, fileName) => {
  const key = `${dirPath}:${fileName}`;

  // Remove existing watcher if any
  if (watchedFiles.has(key)) {
    watchedFiles.get(key)?.watcher.close();
  }

  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return { watcherId: 0 };

  const watcher = watch(dirPath, { persistent: true }, (eventType, filename) => {
    if (!fileName || filename === fileName) {
      win.webContents.send("watch:change", {
        id: key,
        filename: filename ?? "",
        eventType,
      });
    }
  });

  watchedFiles.set(key, { watcher, win });

  return { watcherId: key };
});

ipcMain.handle("watch:stop", async (_event, key) => {
  const watched = watchedFiles.get(key);
  if (watched) {
    watched.watcher.close();
    watchedFiles.delete(key);
  }
});

const TMP_STALE_AGE_MS = 24 * 60 * 60 * 1000;
const TMP_PURGE_INTERVAL_MS = 60 * 60 * 1000;

async function purgeStaleTempFiles(tmpDir: string): Promise<number> {
  try {
    const entries = await fs.readdir(tmpDir, { withFileTypes: true });
    const now = Date.now();
    let deletedCount = 0;

    for (const entry of entries) {
      const entryPath = path.join(tmpDir, entry.name);

      try {
        const stat = await fs.stat(entryPath);
        const lastModified = stat.mtimeMs || stat.birthtimeMs || 0;
        const isStale = now - lastModified > TMP_STALE_AGE_MS;

        if (!isStale) continue;

        await fs.rm(entryPath, { recursive: entry.isDirectory(), force: true });
        deletedCount += 1;
      } catch {
        // Ignore individual remove failures; a stale cleanup pass should be best effort.
      }
    }

    return deletedCount;
  } catch {
    // Ignore when the temp dir does not exist yet.
    return 0;
  }
}

async function purgeTempTree(rootDir: string): Promise<number> {
  let deletedCount = 0;

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(rootDir, entry.name);

      if (!entry.isDirectory()) continue;

      if (entry.name === "tmp") {
        deletedCount += await purgeStaleTempFiles(fullPath);
        continue;
      }

      deletedCount += await purgeTempTree(fullPath);
    }
  } catch {
    // Ignore unreadable directories during the cleanup sweep.
  }

  return deletedCount;
}

async function purgeWontonTmpDirectories(): Promise<void> {
  const userDataDir = app.getPath("userData");
  const tmpRoots = [
    path.join(userDataDir, "tmp"),
    path.join(userDataDir, "wonton"),
  ];

  let deletedCount = 0;

  for (const rootPath of tmpRoots) {
    if (path.basename(rootPath) === "tmp") {
      deletedCount += await purgeStaleTempFiles(rootPath);
    } else {
      deletedCount += await purgeTempTree(rootPath);
    }
  }

  if (deletedCount > 0) {
    console.log(`[wonton tmp cleanup] removed ${deletedCount} stale file(s) under ${userDataDir}`);
  } else {
    console.log(`[wonton tmp cleanup] no stale temp files found under ${userDataDir}`);
  }
}
