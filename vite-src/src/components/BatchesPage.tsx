import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CircleDashed,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Waypoints,
} from "lucide-react";
import { useNav, useProjects, useSettings, useBatches } from "../contexts";
import {
  PorkbunClient,
  PorkbunHealthStatus,
  PorkbunQueueStats,
  resolvePorkbunBaseUrl,
} from "../utils/porkbunApi";
import styles from "./BatchesPage.module.css";

const statusTone: Record<string, { background: string; border: string; color: string }> = {
  submitted: { background: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.4)", color: "#dfe6ff" },
  queued: { background: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.35)", color: "#bfdbfe" },
  running: { background: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.35)", color: "#e9d5ff" },
  completed: { background: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.35)", color: "#bbf7d0" },
  failed: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.35)", color: "#fca5a5" },
  cancelled: { background: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.3)", color: "#e2e8f0" },
  done: { background: "rgba(16, 185, 129, 0.12)", border: "rgba(16, 185, 129, 0.35)", color: "#a7f3d0" },
};

function formatTimestamp(value?: string | null): string {
  if (!value) return "n/a";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "n/a";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function BatchesPage() {
  const { settings } = useSettings();
  const { activeProjectId } = useNav();
  const { getProjectById } = useProjects();
  const { batches, isLoading: batchesLoading, syncBatches, persistBatch } = useBatches();
  const activeProject = activeProjectId ? getProjectById(activeProjectId) : undefined;

  const [health, setHealth] = useState<PorkbunHealthStatus | null>(null);
  const [queueStats, setQueueStats] = useState<PorkbunQueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneAtByTask, setDoneAtByTask] = useState<Record<string, string>>({});
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxIterations, setMaxIterations] = useState(1);
  const refreshLockRef = useRef(false);

  const client = useMemo(() => {
    const baseUrl = resolvePorkbunBaseUrl(settings.porkbunServerUrl);
    return baseUrl ? new PorkbunClient({ baseUrl, apiKey: settings.porkbunApiKey || undefined }) : null;
  }, [settings.porkbunApiKey, settings.porkbunServerUrl]);

  const refreshData = useCallback(async () => {
    if (!client || refreshLockRef.current) return;
    refreshLockRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const [nextHealth, nextStats, nextTasks] = await Promise.all([
        client.fetchHealth(),
        client.fetchQueueStats(),
        client.listTasks(),
      ]);

      setHealth(nextHealth);
      setQueueStats(nextStats);
      await syncBatches(nextTasks);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load Porkbun data.";
      setError(message);
    } finally {
      refreshLockRef.current = false;
      setIsLoading(false);
    }
  }, [client, syncBatches]);

  useEffect(() => {
    if (!client) return;

    const refreshOnVisibility = async () => {
      if (document.visibilityState === "visible") {
        await refreshData();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshOnVisibility();
      }
    };

    const handleFocus = () => {
      void refreshOnVisibility();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    void refreshOnVisibility();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshData();
      }
    }, 30_000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(intervalId);
    };
  }, [client, refreshData]);

  useEffect(() => {
    let isMounted = true;

    async function checkGit() {
      try {
        const result = await window.electronAPI.os.execCommand("git --version");
        if (isMounted) setGitAvailable(result.status === 0);
      } catch {
        if (isMounted) setGitAvailable(false);
      }
    }

    void checkGit();
    return () => {
      isMounted = false;
    };
  }, []);

  const markTaskDone = useCallback((taskId: string) => {
    setDoneAtByTask((prev) => (prev[taskId] ? prev : { ...prev, [taskId]: new Date().toISOString() }));
  }, []);

  const handleDownloadZip = useCallback(async (taskId: string, titleText?: string | null) => {
    if (!client) return;
    setBusyId(taskId);
    setError(null);

    try {
      const resolvedPath = await client.downloadTaskZip(taskId, titleText ? `${titleText.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.zip` : undefined);
      if (resolvedPath) {
        markTaskDone(taskId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "ZIP download failed.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [client, markTaskDone]);

  const handleApplyPatch = useCallback(async (taskId: string) => {
    if (!client) return;
    if (!activeProject?.folderPath) {
      setError("Select a project before applying a patch.");
      return;
    }

    const projectRoot = activeProject.folderPath;
    setBusyId(taskId);
    setError(null);

    try {
      if (gitAvailable === false) {
        throw new Error("Git is not available in this environment, so patch application is disabled.");
      }

      const patchPath = await client.downloadTaskPatch(taskId);
      if (!patchPath) {
        throw new Error("Patch artifact was not available for this task.");
      }

      const gitCheck = await window.electronAPI.os.execCommand("git --version", projectRoot);
      if (gitCheck.status !== 0) {
        throw new Error(gitCheck.stderr || "Git is not available in the selected project folder.");
      }

      const checkResult = await window.electronAPI.os.execCommand(`git apply --check --unsafe-paths "${patchPath}"`, projectRoot);
      if (checkResult.status !== 0) {
        throw new Error(checkResult.stderr || "Patch conflicts were detected and the update could not be applied cleanly.");
      }

      const applyResult = await window.electronAPI.os.execCommand(`git apply --unsafe-paths "${patchPath}"`, projectRoot);
      if (applyResult.status !== 0) {
        throw new Error(applyResult.stderr || "Patch application failed.");
      }

      markTaskDone(taskId);
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Patch application failed.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [activeProject?.folderPath, client, gitAvailable, markTaskDone, refreshData]);

  const handleActivateQueue = useCallback(async () => {
    if (!client) return;
    setBusyId("activate");
    try {
      const startHour = Number.parseInt((settings.porkbunQueueWindowStart || "09:00").split(":")[0] ?? "9", 10);
      const endHour = Number.parseInt((settings.porkbunQueueWindowEnd || "17:00").split(":")[0] ?? "17", 10);

      await client.activateQueueNow({
        startHour: Number.isFinite(startHour) ? startHour : 9,
        endHour: Number.isFinite(endHour) ? endHour : 17,
      });
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Queue activation failed.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [client, refreshData, settings.porkbunQueueWindowEnd, settings.porkbunQueueWindowStart]);

  const handleCreateBatch = useCallback(async () => {
    if (!client) return;
    if (!activeProject?.folderPath) {
      setError("Select a project with a local folder before creating a batch.");
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedTitle || !trimmedPrompt) {
      setError("Both a title and a prompt are required before creating a batch.");
      return;
    }

    const normalizedMaxIterations = Number.parseInt(String(maxIterations), 10);
    if (!Number.isFinite(normalizedMaxIterations) || normalizedMaxIterations < 1) {
      setError("Max iterations must be a whole number greater than or equal to 1.");
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const created = await client.createTask({
        title: trimmedTitle,
        prompt: trimmedPrompt,
        model: settings.porkbunModelId || "gpt-4o-mini",
        llmServer: settings.porkbunLlmServerId || undefined,
        maxIterations: normalizedMaxIterations,
        projectFolderPath: activeProject.folderPath,
      });

      setTitle("");
      setPrompt("");
      setMaxIterations(1);
      await persistBatch(created);
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch creation failed.";
      setError(message);
    } finally {
      setCreating(false);
    }
  }, [activeProject?.folderPath, client, maxIterations, persistBatch, prompt, refreshData, settings.porkbunLlmServerId, settings.porkbunModelId, title]);

  const handleTaskAction = useCallback(async (taskId: string, action: "run" | "cancel" | "retry") => {
    if (!client) return;
    setBusyId(taskId);
    setError(null);

    try {
      if (action === "run") {
        await client.runTaskNow(taskId);
      } else if (action === "cancel") {
        await client.cancelTask(taskId);
      } else {
        await client.retryTask(taskId);
      }
      await refreshData();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Task action failed.";
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [client, refreshData]);

  const sortedTasks = useMemo(
    () => [...batches].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()),
    [batches]
  );

  const visibleTasks = useMemo(
    () =>
      sortedTasks.filter((task) => {
        const doneAt = doneAtByTask[task.id] ?? (task.status === "done" && (task.completed_at ?? task.updated_at)) ? (doneAtByTask[task.id] ?? (task.status === "done" ? (task.completed_at ?? task.updated_at ?? null) : null)) : null;
        if (!doneAt) return true;
        return Date.now() - new Date(doneAt).getTime() <= 30 * 60 * 1000;
      }),
    [doneAtByTask, sortedTasks]
  );

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Waypoints size={20} />
            <h2>Batch Agent</h2>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.secondaryButton} onClick={() => void refreshData()} disabled={isLoading || !client}>
              {isLoading || batchesLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
              Refresh
            </button>
            <button className={styles.primaryButton} onClick={() => void handleActivateQueue()} disabled={busyId === "activate" || !client || batchesLoading}>
              {busyId === "activate" ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
              Activate Queue
            </button>
          </div>
        </div>

        {!client ? (
          <div className={styles.notice}>Configure a Porkbun server URL in settings to enable the batch queue.</div>
        ) : (
          <>
            <div className={styles.statusPanel}>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span>Server</span>
                  <Activity size={14} />
                </div>
                <div className={styles.panelValue}>{health?.status ?? "checking"}</div>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span>Queue</span>
                  <CircleDashed size={14} />
                </div>
                <div className={styles.panelValue}>{queueStats?.total ?? health?.queue_len ?? 0}</div>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span>Running</span>
                  <Play size={14} />
                </div>
                <div className={styles.panelValue}>{queueStats?.running ?? 0}</div>
              </div>
              <div className={styles.panel}>
                <div className={styles.panelHeader}>
                  <span>Window</span>
                  <RefreshCcw size={14} />
                </div>
                <div className={styles.panelValue}>
                  {health?.time_window_active ? "Open" : "Closed"}
                </div>
              </div>
            </div>

            {error && (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className={styles.formCard}>
              <div className={styles.formHeader}>
                <h3>Create New Batch</h3>
              </div>

              <div className={styles.formFields}>
                <div className={styles.field}>
                  <label htmlFor="batch-title">Title</label>
                  <input
                    id="batch-title"
                    className={styles.input}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Refactor the project"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="batch-prompt">Prompt</label>
                  <textarea
                    id="batch-prompt"
                    className={styles.textarea}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the change you want the agent to apply to the selected project."
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="batch-max-iterations">Max iterations</label>
                  <input
                    id="batch-max-iterations"
                    className={styles.input}
                    type="number"
                    min={1}
                    step={1}
                    value={maxIterations}
                    onChange={(e) => {
                      const next = Number.parseInt(e.target.value || "1", 10);
                      setMaxIterations(Number.isFinite(next) && next > 0 ? next : 1);
                    }}
                  />
                </div>

                <div className={styles.formActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => { setTitle(""); setPrompt(""); setMaxIterations(1); setError(null); }}>
                    Clear
                  </button>
                  <button className={styles.primaryButton} type="button" onClick={() => void handleCreateBatch()} disabled={creating || !activeProject?.folderPath}>
                    {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                    Create Batch
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.taskList}>
              {visibleTasks.length === 0 ? (
                <div className={styles.emptyState}>No batches yet. Create the first queued task above.</div>
              ) : (
                visibleTasks.map((task) => {
                  const tone = statusTone[task.status] ?? statusTone.queued;
                  const canRun = ["submitted", "queued"].includes(task.status);
                  const canCancel = ["submitted", "queued", "running"].includes(task.status);
                  const canRetry = task.status === "failed" || task.status === "cancelled";
                  const canDownload = ["completed", "failed", "done"].includes(task.status);
                  const canApplyPatch = canDownload && gitAvailable !== false && Boolean(activeProject?.folderPath);

                  return (
                    <div key={task.id} className={styles.taskCard}>
                      <div className={styles.taskHeader}>
                        <h3 className={styles.taskTitle}>{task.task?.user_prompt ? task.title || "Batch" : task.title || "Batch"}</h3>
                        <span
                          className={styles.statusBadge}
                          style={{
                            background: tone.background,
                            borderColor: tone.border,
                            color: tone.color,
                          }}
                        >
                          {statusLabel(task.status)}
                        </span>
                      </div>

                      <div className={styles.taskMeta}>
                        <span>Created: {formatTimestamp(task.created_at)}</span>
                        <span>Updated: {formatTimestamp(task.updated_at)}</span>
                        {task.completed_at && <span>Completed: {formatTimestamp(task.completed_at)}</span>}
                      </div>

                      <p className={styles.taskPrompt}>{task.task?.user_prompt || "No prompt provided."}</p>

                      {task.error_message && <p className={styles.taskError}>{task.error_message}</p>}

                      <div className={styles.taskActions}>
                        {canRun && (
                          <button
                            className={`${styles.actionButton} ${styles.primary}`}
                            type="button"
                            onClick={() => void handleTaskAction(task.id, "run")}
                            disabled={busyId === task.id}
                          >
                            {busyId === task.id ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                            Run now
                          </button>
                        )}

                        {canCancel && (
                          <button
                            className={`${styles.actionButton} ${styles.danger}`}
                            type="button"
                            onClick={() => void handleTaskAction(task.id, "cancel")}
                            disabled={busyId === task.id}
                          >
                            {busyId === task.id ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                            Cancel
                          </button>
                        )}

                        {canRetry && (
                          <button
                            className={styles.actionButton}
                            type="button"
                            onClick={() => void handleTaskAction(task.id, "retry")}
                            disabled={busyId === task.id}
                          >
                            {busyId === task.id ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                            Retry
                          </button>
                        )}

                        {canDownload && (
                          <button
                            className={styles.actionButton}
                            type="button"
                            onClick={() => void handleDownloadZip(task.id, task.title)}
                            disabled={busyId === task.id}
                          >
                            {busyId === task.id ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                            Download ZIP
                          </button>
                        )}

                        {canApplyPatch && (
                          <button
                            className={styles.actionButton}
                            type="button"
                            onClick={() => void handleApplyPatch(task.id)}
                            disabled={busyId === task.id}
                          >
                            {busyId === task.id ? <Loader2 size={14} className="spin" /> : <Waypoints size={14} />}
                            Apply patch
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
