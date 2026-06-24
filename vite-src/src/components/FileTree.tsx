import { useState, useCallback, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Lock, EyeOff, Bell } from "lucide-react";
import { FilePermission } from "../types/chat";
import { filesystem } from "../utils/electronFs";
import styles from "../components/FileTree.module.css";

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: TreeNode[];
  hasChildren: boolean;
}

interface FileTreeProps {
  folderPath: string;
  permissions: Record<string, FilePermission> | undefined;
  onPermissionChange: (relativePath: string, permission: FilePermission) => void;
  isLoading: boolean;
}

function getPermissionIcon(
  permission: FilePermission,
  isDirectory: boolean
): React.ReactNode {
  if (permission === "hidden") {
    return <EyeOff size={14} />;
  }
  if (permission === "readonly" && isDirectory) {
    return <Lock size={14} />;
  }
  if (permission === "warn") {
    return <Bell size={14} />;
  }
  return null;
}

function PermissionSelect({
  value,
  onChange,
}: {
  value: FilePermission;
  onChange: (p: FilePermission) => void;
}) {
  const options: FilePermission[] = ["full", "readonly", "hidden", "warn"];

  return (
    <select
      className={styles.permissionSelect}
      value={value}
      onChange={(e) => onChange(e.target.value as FilePermission)}
      onClick={(e) => e.stopPropagation()}
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt.charAt(0).toUpperCase() + opt.slice(1)}
        </option>
      ))}
    </select>
  );
}

function TreeNodeComponent({
  node,
  depth,
  folderPath,
  permissions,
  onPermissionChange,
  expandedPaths,
  toggleExpand,
  isLoading,
}: {
  node: TreeNode;
  depth: number;
  folderPath: string;
  permissions: Record<string, FilePermission> | undefined;
  onPermissionChange: (relativePath: string, permission: FilePermission) => void;
  expandedPaths: Set<string>;
  toggleExpand: (path: string) => void;
  isLoading: boolean;
}) {
  const [children, setChildren] = useState<TreeNode[]>([]);
  const [isLoaded, setIsLoaded] = useState(!node.isDirectory || node.hasChildren);
  const [loadError, setLoadError] = useState(false);
  const isExpanded = expandedPaths.has(node.path);

  useEffect(() => {
    if (isExpanded && !isLoaded && !loadError && node.isDirectory) {
      loadChildren();
    }
  }, [isExpanded]);

  const loadChildren = useCallback(async () => {
    try {
      const entries = await filesystem.readDirectory(node.path);
      const treeNodeList: TreeNode[] = [];

      for (const e of entries) {
        if (e.entry.startsWith(".")) continue;
        const fullPath = `${node.path}/${e.entry}`;
        const stat = await filesystem.getStats(fullPath);
        if (!stat) continue;

        treeNodeList.push({
          name: e.entry,
          path: fullPath,
          isDirectory: stat.isDirectory,
          hasChildren: false,
        });
      }

      setChildren(treeNodeList);
      setIsLoaded(true);
    } catch {
      setLoadError(true);
      setIsLoaded(true);
    }
  }, [node.path, node.isDirectory]);

  const handleToggleExpand = useCallback(() => {
    if (!node.isDirectory) return;
    toggleExpand(node.path);
  }, [node.path, node.isDirectory, toggleExpand]);

  const handlePermissionChange = useCallback(
    (p: FilePermission) => {
      onPermissionChange(node.path, p);
    },
    [node.path, onPermissionChange]
  );

  const getEffectivePerm = (): FilePermission => {
    if (!permissions || Object.keys(permissions).length === 0) {
      return "full";
    }
    const normFolderPath = folderPath.replace(/\\/g, "/");
    const normNodePath = node.path.replace(/\\/g, "/");
    let relPath = normNodePath;
    if (normNodePath.startsWith(normFolderPath + "/")) {
      relPath = normNodePath.slice(normFolderPath.length + 1);
    } else if (normNodePath === normFolderPath) {
      relPath = "";
    }
    for (let i = 0; i <= relPath.split("/").filter(Boolean).length; i++) {
      const ancestorPath = relPath.split("/").filter(Boolean).slice(0, i).join("/");
      if (!ancestorPath) continue;
      const perm = permissions[ancestorPath];
      if (perm === "hidden") {
        return "hidden";
      }
      if (perm === "readonly" && node.isDirectory) {
        return "readonly";
      }
      if (perm === "warn" && !node.isDirectory) {
        return "warn";
      }
    }
    return permissions[relPath] || "full";
  };

  const effectivePerm = getEffectivePerm();
  const isHidden = effectivePerm === "hidden";
  const isWarn = effectivePerm === "warn";

  if (isHidden) {
    return (
      <div className={`${styles.node} ${styles.hiddenNode}`} style={{ paddingLeft: `${depth * 16 + 8}px` }} title="Hidden - file access is blocked">
        <div className={styles.nodeContent}>
          <div className={styles.expandPlaceholder} />

          <div className={styles.nodeIcon}>
            {node.isDirectory ? <Folder size={14} /> : <File size={14} />}
          </div>

          <span className={styles.nodeLabel}>{node.name}</span>

          <div className={`${styles.permissionIndicator} ${styles.permissionIndicatorHidden}`}>
            <EyeOff size={14} />
          </div>

          <div className={styles.permissionSelectWrapper}>
            <PermissionSelect
              value={effectivePerm}
              onChange={handlePermissionChange}
            />
          </div>
        </div>
      </div>
    );
  }

  if (isWarn && !node.isDirectory) {
    return (
      <div className={`${styles.node} ${styles.hiddenNode}`} style={{ paddingLeft: `${depth * 16 + 8}px` }} title="Warn - file access requires approval">
        <div className={styles.nodeContent}>
          <div className={styles.expandPlaceholder} />

          <div className={styles.nodeIcon}>
            <File size={14} />
          </div>

          <span className={styles.nodeLabel}>{node.name}</span>

          <div className={`${styles.permissionIndicator} ${styles.permissionIndicatorWarn}`}>
            <Bell size={14} />
          </div>

          <div className={styles.permissionSelectWrapper}>
            <PermissionSelect
              value={effectivePerm}
              onChange={handlePermissionChange}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`${styles.node} ${node.isDirectory ? styles.folderNode : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div className={styles.nodeContent}>
          {node.isDirectory ? (
            <button
              className={styles.expandBtn}
              onClick={handleToggleExpand}
              disabled={isLoading}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <div className={styles.expandPlaceholder} />
          )}

          <div className={styles.nodeIcon}>
            {node.isDirectory
              ? isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />
              : <File size={14} />
            }
          </div>

          <span className={styles.nodeLabel}>{node.name}</span>

          {getPermissionIcon(effectivePerm, node.isDirectory) && (
            <div className={`${styles.permissionIndicator}${isHidden ? ` ${styles.permissionIndicatorHidden}` : isWarn ? ` ${styles.permissionIndicatorWarn}` : ` ${styles.permissionIndicatorReadonly}`}`}>
              {getPermissionIcon(effectivePerm, node.isDirectory)}
            </div>
          )}

          <div className={styles.permissionSelectWrapper}>
            <PermissionSelect
              value={effectivePerm}
              onChange={handlePermissionChange}
            />
          </div>
        </div>
      </div>

      {isExpanded && node.isDirectory && (
        <div className={styles.children}>
          {isLoaded && !loadError && children.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              depth={depth + 1}
              folderPath={folderPath}
              permissions={permissions}
              onPermissionChange={onPermissionChange}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              isLoading={isLoading}
            />
          ))}
          {isLoaded && loadError && (
            <div className={styles.errorNode} style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <span className={styles.errorText}>Failed to load contents</span>
            </div>
          )}
          {isExpanded && !isLoaded && (
            <div className={styles.loadingNode} style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <span className={styles.loadingText}>Loading...</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default function FileTree({
  folderPath,
  permissions,
  onPermissionChange,
  isLoading,
}: FileTreeProps) {
  const [rootNodes, setRootNodes] = useState<TreeNode[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRoot();
  }, [folderPath]);

  const loadRoot = useCallback(async () => {
    try {
      const normFolderPath = folderPath.replace(/\\/g, "/");
      const entries = await filesystem.readDirectory(folderPath);
      const treeNodes: TreeNode[] = [];

      for (const e of entries) {
        if (e.entry.startsWith(".")) continue;
        const fullPath = `${normFolderPath}/${e.entry}`;
        const stat = await filesystem.getStats(fullPath);
        if (!stat) continue;

        treeNodes.push({
          name: e.entry,
          path: fullPath,
          isDirectory: stat.isDirectory,
          hasChildren: false,
        });
      }

      setRootNodes(treeNodes);
      setIsLoaded(true);
    } catch {
      setLoadError(true);
      setIsLoaded(true);
    }
  }, [folderPath]);

  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

 useEffect(() => {
    if (isLoaded && permissions && Object.keys(permissions).length > 0) {
      const normFolderPath = folderPath.replace(/\\/g, "/");
      const expanded = new Set<string>(expandedPaths);
      let needsUpdate = false;
      for (const relPath of Object.keys(permissions)) {
        const parts = relPath.split("/").filter(Boolean);
        const ancestorCount = parts.length > 1 ? parts.length - 1 : parts.length;
        for (let i = 0; i < ancestorCount; i++) {
          const ancestorRel = parts.slice(0, i + 1).join("/");
          const ancestorAbs = `${normFolderPath}/${ancestorRel}`;
          if (!expanded.has(ancestorAbs)) {
            expanded.add(ancestorAbs);
            needsUpdate = true;
          }
        }
      }
      if (needsUpdate) {
        setExpandedPaths(expanded);
      }
    }
  }, [isLoaded, folderPath, permissions]);

  if (loadError && !isLoaded) {
    return (
      <div className={styles.errorContainer}>
        <span className={styles.errorText}>Failed to load folder contents</span>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={styles.loadingContainer}>
        <span className={styles.loadingText}>Loading folder...</span>
      </div>
    );
  }

  if (rootNodes.length === 0) {
    return (
      <div className={styles.emptyContainer}>
        <span className={styles.emptyText}>Folder is empty</span>
      </div>
    );
  }

  return (
    <div className={styles.treeContainer}>
      {rootNodes.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          depth={0}
          folderPath={folderPath}
          permissions={permissions}
          onPermissionChange={onPermissionChange}
          expandedPaths={expandedPaths}
          toggleExpand={toggleExpand}
          isLoading={isLoading}
        />
      ))}
    </div>
  );
}
