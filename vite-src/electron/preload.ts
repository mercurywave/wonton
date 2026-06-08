import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal API bridge to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // filesystem module
  filesystem: {
    createDirectory: (dirPath: string) => ipcRenderer.invoke("filesystem:createDirectory", dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke("filesystem:readFile", filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke("filesystem:writeFile", filePath, content),
    appendFile: (filePath: string, content: string) => ipcRenderer.invoke("filesystem:appendFile", filePath, content),
    remove: (filePath: string) => ipcRenderer.invoke("filesystem:remove", filePath),
    readDirectory: (dirPath: string) => ipcRenderer.invoke("filesystem:readDirectory", dirPath),
    getStats: (filePath: string) => ipcRenderer.invoke("filesystem:getStats", filePath),
    getJoinedPath: (basePath: string, relativePath: string) => ipcRenderer.invoke("filesystem:getJoinedPath", basePath, relativePath),
    getAbsolutePath: (filePath: string) => ipcRenderer.invoke("filesystem:getAbsolutePath", filePath),
    getRelativePath: (fromPath: string, toPath: string) => ipcRenderer.invoke("filesystem:getRelativePath", fromPath, toPath),
    getNormalizedPath: (filePath: string) => ipcRenderer.invoke("filesystem:getNormalizedPath", filePath),
    createWatcher: (dirPath: string) => ipcRenderer.invoke("watch:start", dirPath, ""),
    removeWatcher: (watcherId: string) => ipcRenderer.invoke("watch:stop", watcherId),
  },

  // os module
  os: {
    showFolderDialog: (title: string) => ipcRenderer.invoke("os:showFolderDialog", title),
    open: (folderPath: string) => ipcRenderer.invoke("os:open", folderPath),
    execCommand: (command: string) => ipcRenderer.invoke("os:execCommand", command),
  },

  // computer module
  computer: {
    getOSInfo: () => ipcRenderer.invoke("computer:getOSInfo"),
  },

  // events module
  events: {
    on: (eventName: string, callback: (event: any, ...args: any[]) => void) => {
      const listener = (_event: any, ...args: any[]) => callback(_event, ...args);
      ipcRenderer.on(eventName, listener);
      return () => {
        ipcRenderer.removeListener(eventName, listener);
      };
    },
    off: (eventName: string, callback: (event: any, ...args: any[]) => void) => {
      ipcRenderer.removeListener(eventName, callback);
    },
  },
});
