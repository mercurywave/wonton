import { useState, useCallback } from "react";
import { GitCompare, RefreshCw, CheckCircle, AlertCircle, Loader2, GitBranch, ArrowUpCircle, Info } from "lucide-react";
import styles from "./VersionControlPage.module.css";
import { useGit } from "../hooks/useGit";
import { useProjects, useNav } from "../contexts";
import { isBackendConnected } from "../utils/platformUtils";

export default function VersionControlPage() {
  const { state: navState, activeProjectId } = useNav();
  const { getProjectById } = useProjects();
  const project = activeProjectId ? getProjectById(activeProjectId) : undefined;
  const cwd = project?.folderPath;

  // Wait for initial navigation setup to complete
  if (navState.status === "initializing") {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.loading}>
            <Loader2 size={20} className={styles.spinner} />
            <p>Loading project data...</p>
          </div>
        </div>
      </div>
    );
  }

  // No active project selected
  if (!activeProjectId) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.noProject}>
            <Info size={24} />
            <p>Please select a project to use version control.</p>
          </div>
        </div>
      </div>
    );
  }

  // Project selected but no folder linked
  if (!cwd) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.noProject}>
            <Info size={24} />
            <p>This project doesn't have a linked folder. Please link a folder in project settings to use version control.</p>
          </div>
        </div>
      </div>
    );
  }

  const {
    isAvailable,
    status,
    loading,
    error,
    refresh,
    commit,
    sync,
    remoteUrl,
    commitsAhead,
  } = useGit(cwd);

  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState(false);
  const [commitError, setCommitError] = useState("");
  const [syncError, setSyncError] = useState("");

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      setCommitError("Commit message is required");
      return;
    }

    setCommitting(true);
    setCommitError("");
    setCommitSuccess(false);

    const result = await commit(commitMessage);
    setCommitting(false);

    if (result.success) {
      setCommitSuccess(true);
      setCommitMessage("");
      setTimeout(() => setCommitSuccess(false), 3000);
    } else {
      setCommitError(result.error || "Commit failed");
      setTimeout(() => setCommitError(""), 5000);
    }
  }, [commitMessage, commit]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncError("");
    setSyncSuccess(false);

    const result = await sync();
    setSyncing(false);

    if (result.success) {
      setSyncSuccess(true);
      setTimeout(() => setSyncSuccess(false), 3000);
    } else {
      setSyncError(result.error || "Sync failed");
      setTimeout(() => setSyncError(""), 5000);
    }
  }, [sync]);

  const getStatusIcon = (entry: (typeof status)[0]) => {
    if (entry.staged) {
      return <CheckCircle size={14} className={styles.stagedIcon} />;
    }
    if (entry.unstaged) {
      return <AlertCircle size={14} className={styles.unstagedIcon} />;
    }
    return null;
  };

  const getStatusLabel = (entry: (typeof status)[0]) => {
    const parts: string[] = [];
    if (entry.staged) parts.push("Staged");
    if (entry.unstaged) parts.push("Modified");
    return parts.length > 0 ? parts.join(", ") : entry.status.charAt(0).toUpperCase() + entry.status.slice(1);
  };

  const getStatusColor = (entry: (typeof status)[0]) => {
    if (entry.staged) return "#22c55e";
    if (entry.unstaged) return "#f59e0b";
    return "#ef4444";
  };

  const fileCount = status.length;

  if (!isBackendConnected()) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.browserWarning}>
            <p>Version control requires desktop mode (Electron). It is not available in browser dev mode.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading && isAvailable === null) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.loading}>
            <Loader2 size={20} className={styles.spinner} />
            <p>Checking git status...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isAvailable === false) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <GitCompare size={22} />
            <h2>Version Control</h2>
          </div>
          <div className={styles.noGit}>
            <GitBranch size={24} />
            <p>Git is not initialized in this project folder.</p>
            <p className={styles.hint}>
              Initialize git by running <code>git init</code> in the project folder: {cwd}
            </p>
            <button className={styles.refreshBtn} onClick={refresh}>
              <RefreshCw size={14} />
              Refresh
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <GitCompare size={22} />
          <h2>Version Control</h2>
          {remoteUrl && (
            <span className={styles.remoteInfo} title={`Remote: ${remoteUrl}`} aria-label={`Remote: ${remoteUrl}`} tabIndex={0}>
              <GitBranch size={16} />
            </span>
          )}
          <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? styles.spinner : ""} />
            Refresh
          </button>
        </div>

        {/* Error Messages */}
        {(error || commitError || syncError) && (
          <div className={styles.errorMessage}>
            <AlertCircle size={16} />
            <span>{error || commitError || syncError}</span>
          </div>
        )}

        {/* Success Messages */}
        {commitSuccess && (
          <div className={styles.successMessage}>
            <CheckCircle size={16} />
            <span>Committed successfully!</span>
          </div>
        )}
        {syncSuccess && (
          <div className={styles.successMessage}>
            <CheckCircle size={16} />
            <span>Synced successfully!</span>
          </div>
        )}

        {/* File List */}
        {fileCount > 0 && (
          <div className={styles.fileListSection}>
            <h3 className={styles.sectionTitle}>
              Changed Files ({fileCount})
            </h3>
            <div className={styles.fileList}>
              {status.map((entry, index) => (
                <div key={`${entry.filePath}-${index}`} className={styles.fileItem}>
                  <div className={styles.fileIcon}>
                    {getStatusIcon(entry)}
                  </div>
                  <div className={styles.fileInfo}>
                    <span className={styles.filePath} title={entry.filePath}>{entry.filePath}</span>
                    {entry.renameFrom && (
                      <span className={styles.renameFrom} title={`Renamed from ${entry.renameFrom}`}>
                        from {entry.renameFrom}
                      </span>
                    )}
                  </div>
                  <span className={styles.fileStatus} style={{ color: getStatusColor(entry) }}>
                    {getStatusLabel(entry)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {fileCount === 0 && commitsAhead === 0 && (
          <div className={styles.noChanges}>
            <CheckCircle size={24} />
            <p>No changes detected. Your repository is up to date.</p>
          </div>
        )}

        {fileCount === 0 && commitsAhead > 0 && (
          <div className={styles.pushSection}>
            <div className={styles.pushInfo}>
              <ArrowUpCircle size={20} />
              <span>{commitsAhead} local commit{commitsAhead === 1 ? "" : "s"} to push</span>
            </div>
            <button
              className={`${styles.actionBtn} ${styles.syncBtn}`}
              onClick={handleSync}
              disabled={committing || syncing}
            >
              {syncing ? (
                <>
                  <Loader2 size={16} className={styles.spinner} />
                  Syncing...
                </>
              ) : (
                <>
                  <ArrowUpCircle size={16} />
                  Push {commitsAhead} commit{commitsAhead === 1 ? "" : "s"}
                </>
              )}
            </button>
          </div>
        )}

        {/* Commit Section - only when there are changes */}
        {fileCount > 0 && (
          <div className={styles.commitSection}>
            <h3 className={styles.sectionTitle}>Commit Changes</h3>
            <textarea
              className={styles.commitTextarea}
              placeholder="Enter commit message..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              rows={3}
              disabled={committing || syncing}
            />
            <div className={styles.commitActions}>
              <button
                className={`${styles.actionBtn} ${styles.commitBtn}`}
                onClick={handleCommit}
                disabled={committing || syncing || !commitMessage.trim()}
              >
                {committing ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Committing...
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    Commit
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
