import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { FilePermission } from "../types/chat";
import { getEffectivePermissionInternal } from "../store/filePermissions";
import { useFilePermissionsData } from "../hooks/useFilePermissions";

interface FilePermissionsContextValue {
  permissions: Record<string, FilePermission> | undefined;
  isLoading: boolean;
  setPermission: (relativePath: string, permission: FilePermission) => Promise<void>;
  removePermission: (relativePath: string) => Promise<void>;
  getEffectivePermission: (relativePath: string, isDirectory: boolean) => FilePermission;
  refresh: () => void;
}

const FilePermissionsContext = createContext<FilePermissionsContextValue | null>(null);

export function FilePermissionsProvider({
  children,
  projectId,
}: {
  children: ReactNode;
  projectId: string | null | undefined;
}) {
  const {
    permissions,
    isLoading,
    setPermission,
    removePermission,
    refresh,
  } = useFilePermissionsData(projectId);

  const getEffectivePermission = useMemo(() => {
    return (relativePath: string, isDirectory: boolean) =>
      getEffectivePermissionInternal(permissions, relativePath, isDirectory);
  }, [permissions]);

  const value = useMemo(
    () => ({
      permissions,
      isLoading,
      setPermission,
      removePermission,
      getEffectivePermission,
      refresh,
    }),
    [permissions, isLoading, setPermission, removePermission, getEffectivePermission, refresh]
  );

  return <FilePermissionsContext.Provider value={value}>{children}</FilePermissionsContext.Provider>;
}

export function useFilePermissions(): FilePermissionsContextValue {
  const ctx = useContext(FilePermissionsContext);
  if (!ctx) {
    throw new Error("useFilePermissions must be used within a FilePermissionsProvider");
  }
  return ctx;
}
