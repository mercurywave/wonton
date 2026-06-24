import { FilePermission } from "../types/chat";
import { projectMetaStore } from "./projectMeta";

type Listener = () => void;

interface FilePermissionsState {
  permissions: Record<string, FilePermission>;
  isLoaded: boolean;
}

interface FilePermissionsStore {
  getPermissions(projectId: string): Record<string, FilePermission> | undefined;
  load(projectId: string): Promise<void>;
  setPermission(projectId: string, relativePath: string, permission: FilePermission): Promise<void>;
  removePermission(projectId: string, relativePath: string): Promise<void>;
  subscribe(projectId: string, listener: Listener): () => void;
}

const state = new Map<string, FilePermissionsState>();
const listeners = new Map<string, Set<Listener>>();

function dispatch(projectId: string) {
  const set = listeners.get(projectId);
  if (!set) return;
  for (const listener of set) {
    listener();
  }
}

function getAncestorPaths(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    paths.push(parts.slice(0, i + 1).join("/"));
  }
  return paths;
}

function getEffectivePermissionInternal(
  permissions: Record<string, FilePermission> | undefined,
  relativePath: string,
  isDirectory: boolean
): FilePermission {
  if (!permissions || Object.keys(permissions).length === 0) {
    return "full";
  }

  const allPaths = getAncestorPaths(relativePath);

  for (const path of allPaths) {
    const perm = permissions[path];
    if (perm === "hidden") {
      return "hidden";
    }
    if (perm === "readonly") {
      return "readonly";
    }
    if (perm === "warn" && !isDirectory) {
      return "warn";
    }
  }

  if (permissions[relativePath]) {
    return permissions[relativePath];
  }

  return "full";
}

const filePermissionsStore: FilePermissionsStore = {
  getPermissions(projectId: string) {
    return state.get(projectId)?.permissions;
  },

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    const meta = projectMetaStore.getProjectMeta(projectId);
    const permissions = meta?.filePermissions ?? {};
    state.set(projectId, { permissions, isLoaded: true });
    dispatch(projectId);
  },

  async setPermission(projectId: string, relativePath: string, permission: FilePermission) {
    if (permission === "full") {
      await this.removePermission(projectId, relativePath);
      return;
    }
    const meta = projectMetaStore.getProjectMeta(projectId);
    const existingPermissions = meta?.filePermissions ?? {};
    const nextPermissions = { ...existingPermissions, [relativePath]: permission };
    await projectMetaStore.update(projectId, { filePermissions: nextPermissions });

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, { permissions: nextPermissions, isLoaded: true });
      dispatch(projectId);
    }
  },

  async removePermission(projectId: string, relativePath: string) {
    const meta = projectMetaStore.getProjectMeta(projectId);
    const existingPermissions = meta?.filePermissions ?? {};
    const { [relativePath]: _, ...nextPermissions } = existingPermissions;
    await projectMetaStore.update(projectId, { filePermissions: nextPermissions });

    const current = state.get(projectId);
    if (current) {
      state.set(projectId, { permissions: nextPermissions, isLoaded: true });
      dispatch(projectId);
    }
  },

  subscribe(projectId: string, listener: Listener) {
    if (!listeners.has(projectId)) {
      listeners.set(projectId, new Set<Listener>());
    }
    listeners.get(projectId)!.add(listener);
    return () => {
      listeners.get(projectId)?.delete(listener);
    };
  },
};

export { filePermissionsStore, getEffectivePermissionInternal };
