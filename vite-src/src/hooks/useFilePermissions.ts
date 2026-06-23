import { useState, useEffect, useCallback } from "react";
import { FilePermission } from "../types/chat";
import { filePermissionsStore } from "../store/filePermissions";

export function useFilePermissionsData(projectId: string | null | undefined) {
  const [permissions, setPermissions] = useState<Record<string, FilePermission> | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(() => {
    setPermissions(filePermissionsStore.getPermissions(projectId!));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        setIsLoading(false);
        setInitialized(true);
        return;
      }
      setIsLoading(true);
      await filePermissionsStore.load(projectId);
      if (!cancelled) {
        refresh();
        setIsLoading(false);
        setInitialized(true);
      }
    })();

    if (projectId) {
      const unsubscribe = filePermissionsStore.subscribe(projectId, refresh);
      return () => {
        cancelled = true;
        unsubscribe();
      };
    }
  }, [projectId, refresh]);

  const setPermission = useCallback(async (relativePath: string, permission: FilePermission) => {
    if (!projectId) return;
    await filePermissionsStore.setPermission(projectId, relativePath, permission);
  }, [projectId]);

  const removePermission = useCallback(async (relativePath: string) => {
    if (!projectId) return;
    await filePermissionsStore.removePermission(projectId, relativePath);
  }, [projectId]);

  const load = useCallback(async () => {
    if (!projectId) return;
    await filePermissionsStore.load(projectId);
    refresh();
  }, [projectId, refresh]);

  return {
    permissions,
    isLoading,
    initialized,
    setPermission,
    removePermission,
    load,
    refresh,
  };
}
