import { useState } from "react";
import { GitBranch, RotateCw, FolderOpen, Loader2, Play } from "lucide-react";
import styles from "../components/WorkflowsPage.module.css";
import { useFlowsContext } from "../contexts/FlowsContext";
import { isNeutralinoConnected, isWindows } from "../utils/neuUtils";
import { os } from "@neutralinojs/lib";

function normalizePath(p: string): string {
  return p.replace(/\//g, "\\").replace(/\\/g, "\\");
}

export default function WorkflowsPage() {
  const { flows, disabledFlows, isLoading, refreshFlows, flowsPath, toggleFlow, conflictIds, conflictFiles } = useFlowsContext();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const windowsOnly = isWindows();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshFlows();
    setIsRefreshing(false);
  };

  const handleOpenFolder = async () => {
    if (!isNeutralinoConnected() || !flowsPath) return;
    try {
      await os.execCommand(`explorer "${normalizePath(flowsPath)}"`)
    } catch (err) {
      console.error("handleOpenFolder: failed to open flows folder", err);
    }
  };

  const toggleLabel = (flowId: string) => disabledFlows.includes(flowId) ? "Disabled" : "Enabled";

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <GitBranch size={20} />
            <h2>Workflows</h2>
          </div>
          <div className={styles.headerActions}>
            {windowsOnly && flowsPath && (
              <button
                className={styles.openFolderBtn}
                onClick={handleOpenFolder}
                type="button"
                title="Open flows folder"
              >
                <FolderOpen size={14} />
                <span>Open Folder</span>
              </button>
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
                  The following workflow IDs appear in multiple files. The duplicate entries have been skipped:
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
                  Add <code>.yaml</code> files to the <code>flows/</code> directory.
                </p>
              </div>
            ) : (
              <div className={styles.flowsList}>
                {flows.map((flow) => {
                  const isDisabled = disabledFlows.includes(flow.id);
                  const isCommand = (flow as any).isCommand;
                  const hasConflict = conflictIds.length > 0;
                  return (
                    <div
                      key={flow.id}
                      className={`${styles.flowCard} ${isDisabled ? styles.flowCardDisabled : ""}`}
                    >
                      <div className={styles.flowCardHeader}>
                        <span className={styles.flowName}>
                          {isCommand ? <Play size={14} className={styles.commandIcon} /> : <GitBranch size={14} className={styles.flowIcon} />}
                          {" "}{flow.name}
                        </span>
                        <button
                          className={`${styles.toggleBtn} ${isDisabled ? styles.toggleBtnDisabled : styles.toggleBtnEnabled}`}
                          onClick={() => toggleFlow(flow.id)}
                          type="button"
                          title={hasConflict ? "Fix conflicting workflow IDs to enable/disable" : isDisabled ? "Enable workflow" : "Disable workflow"}
                          disabled={hasConflict}
                        >
                          {toggleLabel(flow.id)}
                        </button>
                      </div>
                      {flow.description && (
                        <div className={styles.flowDescription}>
                          {flow.description.length > 120
                            ? flow.description.slice(0, 120) + "..."
                            : flow.description}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
