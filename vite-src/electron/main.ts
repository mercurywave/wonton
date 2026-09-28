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
async function fsCreateDirectory(_event: Electron.IpcMainInvokeEvent, dirPath: string) {
  if (dirPath.trim() === "") {
    throw new Error("Directory path is required");
  }

  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to create directory");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_CREATE_DIR" });
    throw error;
  }
}

async function fsTryReadFile(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  if (filePath.trim() === "") {
    return null;
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    const error = new Error(err instanceof Error ? err.message : "Failed to read file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_READ" });
    throw error;
  }
}

async function fsReadFile(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  if (filePath.trim() === "") {
    throw new Error("File path is required");
  }

  try {
    const content = await fs.readFile(filePath, "utf-8");
    return content;
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to read file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_READ" });
    throw error;
  }
}

async function fsDoesFileExist(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  if (filePath.trim() === "") {
    return false;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fsWriteFile(_event: Electron.IpcMainInvokeEvent, filePath: string, content: string) {
  try {
    await fs.writeFile(filePath, content, "utf-8");
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to write file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_WRITE" });
    throw error;
  }
}

async function fsAppendFile(_event: Electron.IpcMainInvokeEvent, filePath: string, content: string) {
  try {
    await fs.appendFile(filePath, content, "utf-8");
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to append to file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_APPEND" });
    throw error;
  }
}

async function fsRemove(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  try {
    await fs.rm(filePath, { recursive: false, force: true });
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to remove file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_REMOVE" });
    throw error;
  }
}

async function fsReadDirectory(_event: Electron.IpcMainInvokeEvent, dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.map((entry: string) => ({ entry }));
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to read directory");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_READ_DIR" });
    throw error;
  }
}

async function fsGetStats(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return {
      size: stat.size,
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      modifiedTime: stat.mtimeMs,
      createdTime: stat.birthtimeMs,
    };
  } catch (err: unknown) {
    const error = new Error(err instanceof Error ? err.message : "Failed to stat file");
    Object.defineProperty(error, "code", { value: (err as NodeJS.ErrnoException).code || "E_FS_STATS" });
    throw error;
  }
}

async function fsIsBinaryFile(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  if (filePath.trim() === "") {
    return false;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory() || !stat.isFile()) return false;

    // Read the first 512 bytes to check for binary content
    const buffer = await fs.readFile(filePath, { encoding: null, flag: "r" });
    const chunk = buffer.slice(0, 512);

    // Check for null bytes which are indicative of binary files
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === 0x00) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function fsGetJoinedPath(_event: Electron.IpcMainInvokeEvent, basePath: string, relativePath: string) {
  return path.join(basePath, relativePath);
}

async function fsGetAbsolutePath(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  return path.resolve(filePath);
}

async function fsGetRelativePath(_event: Electron.IpcMainInvokeEvent, fromPath: string, toPath: string) {
  return path.relative(fromPath, toPath);
}

async function fsGetNormalizedPath(_event: Electron.IpcMainInvokeEvent, filePath: string) {
  return path.normalize(filePath);
}

async function fsCreateWatcher(_event: Electron.IpcMainInvokeEvent, _dirPath: string) {
  // File watchers are handled in the renderer process via IPC
  return { watcherId: Date.now() };
}

async function fsRemoveWatcher(_event: Electron.IpcMainInvokeEvent, _watcherId: string) {
  // No-op: watchers are managed in renderer
}

// Register filesystem IPC handlers
ipcMain.handle("filesystem:createDirectory", fsCreateDirectory);
ipcMain.handle("filesystem:tryReadFile", fsTryReadFile);
ipcMain.handle("filesystem:doesFileExist", fsDoesFileExist);
ipcMain.handle("filesystem:readFile", fsReadFile);
ipcMain.handle("filesystem:writeFile", fsWriteFile);
ipcMain.handle("filesystem:appendFile", fsAppendFile);
ipcMain.handle("filesystem:remove", fsRemove);
ipcMain.handle("filesystem:readDirectory", fsReadDirectory);
ipcMain.handle("filesystem:getStats", fsGetStats);
ipcMain.handle("filesystem:isBinaryFile", fsIsBinaryFile);
ipcMain.handle("filesystem:getJoinedPath", fsGetJoinedPath);
ipcMain.handle("filesystem:getAbsolutePath", fsGetAbsolutePath);
ipcMain.handle("filesystem:getRelativePath", fsGetRelativePath);
ipcMain.handle("filesystem:getNormalizedPath", fsGetNormalizedPath);
ipcMain.handle("filesystem:createWatcher", fsCreateWatcher);
ipcMain.handle("filesystem:removeWatcher", fsRemoveWatcher);

// os module
async function osShowFolderDialog(_event: Electron.IpcMainInvokeEvent, title: string) {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
    title,
  });
  if (!result || result.filePaths.length === 0) return "";
  return result.filePaths[0];
}

async function osShowSaveDialog(_event: Electron.IpcMainInvokeEvent, title: string, defaultPath?: string) {
  const result = await dialog.showSaveDialog({
    title,
    defaultPath: defaultPath || undefined,
  });
  if (result.canceled || !result.filePath) return "";
  return result.filePath;
}

async function osOpen(_event: Electron.IpcMainInvokeEvent, folderPath: string) {
  return shell.openPath(folderPath);
}

async function osDownloadFile(_event: Electron.IpcMainInvokeEvent, url: string, targetPath: string) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response.text().catch(() => "");
    throw new Error(payload || `Download failed (${response.status})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await fs.writeFile(targetPath, buffer);
  return targetPath;
}

async function osExecCommand(_event: Electron.IpcMainInvokeEvent, command: string, cwd?: string) {
  try {
    const result = await execAsync(command, { cwd });
    return { stdout: result.stdout, stderr: result.stderr, status: 0 };
  } catch (err: unknown) {
    const errnoErr = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number; status?: number; signal?: string; killed?: boolean };
    return { stdout: errnoErr.stdout ?? "", stderr: errnoErr.stderr ?? "", status: (errnoErr.code ?? errnoErr.status) ?? 1, signal: errnoErr.signal, killed: errnoErr.killed };
  }
}

// Register os IPC handlers
ipcMain.handle("os:showFolderDialog", osShowFolderDialog);
ipcMain.handle("os:showSaveDialog", osShowSaveDialog);
ipcMain.handle("os:open", osOpen);
ipcMain.handle("os:downloadFile", osDownloadFile);
ipcMain.handle("os:execCommand", osExecCommand);

// computer module
async function computerGetOSInfo(_event: Electron.IpcMainInvokeEvent) {
  return {
    name: process.platform,
    arch: os.arch(),
    platform: process.platform,
    version: os.release(),
    type: os.type(),
  };
}

// Register computer IPC handlers
ipcMain.handle("computer:getOSInfo", computerGetOSInfo);

// dataDir module - path resolution that requires Node.js access
async function dataDirGetAppPath(_event: Electron.IpcMainInvokeEvent) {
  return app.getPath("userData");
}

async function dataDirGetHomeDir(_event: Electron.IpcMainInvokeEvent) {
  return os.homedir();
}

async function dataDirGetPlatform(_event: Electron.IpcMainInvokeEvent) {
  return process.platform;
}

// Register dataDir IPC handlers
ipcMain.handle("dataDir:getAppPath", dataDirGetAppPath);
ipcMain.handle("dataDir:getHomeDir", dataDirGetHomeDir);
ipcMain.handle("dataDir:getPlatform", dataDirGetPlatform);

// notifications module
const notificationIcon = path.resolve(__dirname, "../../public/takeout.png");

ipcMain.handle("notification:show", async (_event, title, body, _behavior) => {
  if(!Notification.isSupported()) {
    console.error("notifications not supported on platform");
    return; 
  }
  const notify = new Notification({
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
