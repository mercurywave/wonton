import { useState } from "react";
import { GitBranch, RotateCw, FolderOpen, Loader2, Play } from "lucide-react";
import styles from "../components/WorkflowsPage.module.css";
import { useFlowsContext } from "../contexts/FlowsContext";
import { isBackendConnected, isWindowsSync } from "../utils/platformUtils";

function SectionHeader({ title, path }: { title: string; path: string }) {
  const [isOpening, setIsOpening] = useState(false);

  const handleOpen = async () => {
    if (!isBackendConnected() || !path || isOpening) return;
    setIsOpening(true);
    try {
      await window.electronAPI.os.open(path);
    } catch (err) {
      console.error("handleOpenFolder: failed to open flows folder", err);
    }
    setIsOpening(false);
  };

  return (
    <div className={styles.sectionHeader}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <button
        className={styles.openFolderBtn}
        onClick={handleOpen}
        type="button"
        title="Open folder"
        disabled={isOpening}
      >
        {isOpening ? (
          <Loader2 size={14} className={styles.spinner} />
        ) : (
          <FolderOpen size={14} />
        )}
        <span>Open Folder</span>
      </button>
    </div>
  );
}

function FlowCard({ flow, isDisabled, isOverridden, hasConflict, onToggle }: {
  flow: any;
  isDisabled: boolean;
  isOverridden: boolean;
  hasConflict: boolean;
  onToggle: () => void;
}) {
  const isCommand = (flow as any).isCommand;
  const toggleLabel = isDisabled ? "Disabled" : "Enabled";

  return (
    <div
      className={`${styles.flowCard} ${isDisabled ? styles.flowCardDisabled : ""} ${isOverridden ? styles.flowCardOverridden : ""}`}
    >
      <div className={styles.flowCardHeader}>
        <span className={styles.flowName}>
          {isCommand ? <Play size={14} className={styles.commandIcon} /> : <GitBranch size={14} className={styles.flowIcon} />}
          {" "}{flow.name}
        </span>
        <button
          className={`${styles.toggleBtn} ${isDisabled ? styles.toggleBtnDisabled : styles.toggleBtnEnabled}`}
          onClick={onToggle}
          type="button"
          title={hasConflict ? "Fix conflicting workflow IDs to enable/disable" : isDisabled ? "Enable workflow" : "Disable workflow"}
          disabled={hasConflict || isOverridden}
        >
          {toggleLabel}
        </button>
      </div>
      {flow.description && (
        <div className={styles.flowDescription}>
          {flow.description.length > 120
            ? flow.description.slice(0, 120) + "..."
            : flow.description}
        </div>
      )}
      {isOverridden && (
        <div className={styles.overriddenBadge}>
          <span className={styles.overriddenIndicator}>Overridden by project workflow</span>
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { flows, disabledFlows, isLoading, refreshFlows, globalFlowsPath, projectFlowsPath, toggleFlow, conflictIds, conflictFiles, overriddenGlobalIds } = useFlowsContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const windowsOnly = isWindowsSync();
  const overriddenSet = new Set(overriddenGlobalIds);
  const hasConflict = conflictIds.length > 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshFlows();
    setIsRefreshing(false);
  };

  // Split flows into project-level and global
  const projectFlows = flows.filter((f) => f.source && f.source !== "global");
  const globalFlows = flows.filter((f) => f.source === "global");

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <GitBranch size={20} />
            <h2>Workflows</h2>
          </div>
          <div className={styles.headerActions}>
            {windowsOnly && (globalFlowsPath || projectFlowsPath) && (
              <>
                {projectFlowsPath && (
                  <button
                    className={styles.openFolderBtn}
                    onClick={async () => {
                      if (!isBackendConnected() || !projectFlowsPath) return;
                      try {
                        await window.electronAPI.os.open(projectFlowsPath);
                      } catch (err) {
                        console.error("handleOpenFolder: failed to open project flows folder", err);
                      }
                    }}
                    type="button"
                    title="Open project flows folder"
                  >
                    <FolderOpen size={14} />
                    <span>Project Folder</span>
                  </button>
                )}
                {globalFlowsPath && (
                  <button
                    className={styles.openFolderBtn}
                    onClick={async () => {
                      if (!isBackendConnected() || !globalFlowsPath) return;
                      try {
                        await window.electronAPI.os.open(globalFlowsPath);
                      } catch (err) {
                        console.error("handleOpenFolder: failed to open global flows folder", err);
                      }
                    }}
                    type="button"
                    title="Open global flows folder"
                  >
                    <FolderOpen size={14} />
                    <span>Global Folder</span>
                  </button>
                )}
              </>
            )}
            <button
              className={styles.refreshBtn}
              onClick={handleRefresh}
              type="button"
              title="Refresh workflows"
              disabled={isRefreshing}
            >
              {isRefreshing ? (
                <Loader2 size={14} className={styles.spinner} />
              ) : (
                <RotateCw size={14} />
              )}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className={styles.loading}>Loading workflows...</div>
        ) : (
          <>
            {conflictIds.length > 0 && (
              <div className={styles.conflictBanner}>
                <div className={styles.conflictTitle}>Conflicting workflow IDs detected</div>
                <p className={styles.conflictText}>
                  The following workflow IDs appear in multiple files within the same folder. The duplicate entries have been skipped:
                </p>
                <ul className={styles.conflictList}>
                  {conflictIds.map((id) => (
                    <li key={id}>
                      {id} <span className={styles.conflictFile}>("{conflictFiles[id]}")</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {flows.length === 0 ? (
              <div className={styles.empty}>
                <p>No workflows found.</p>
                <p className={styles.emptyHint}>
                  Add <code>.yaml</code> files to a workflows folder.
                </p>
              </div>
            ) : (
              <>
                {projectFlows.length > 0 && (
                  <div className={styles.section}>
                    <SectionHeader title="Project Workflows" path={projectFlowsPath} />
                    <div className={styles.flowsList}>
                      {projectFlows.map((flow) => (
                        <FlowCard
                          key={flow.id}
                          flow={flow}
                          isDisabled={disabledFlows.includes(flow.id)}
                          isOverridden={false}
                          hasConflict={false}
                          onToggle={() => toggleFlow(flow.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {globalFlows.length > 0 && (
                  <div className={styles.section}>
                    <SectionHeader title="Global Workflows" path={globalFlowsPath} />
                    <div className={styles.flowsList}>
                      {globalFlows.map((flow) => (
                        <FlowCard
                          key={flow.id}
                          flow={flow}
                          isDisabled={disabledFlows.includes(flow.id)}
                          isOverridden={overriddenSet.has(flow.id)}
                          hasConflict={hasConflict}
                          onToggle={() => toggleFlow(flow.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
