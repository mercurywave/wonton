import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Plus,
  RefreshCcw,
  RotateCcw,
  Trash2,
  Waypoints,
  X,
} from "lucide-react";
import { useNav, useProjects, useSettings, useBatches } from "../contexts";
import {
  getErrorMessage,
  PorkbunClient,
  PorkbunHealthStatus,
  PorkbunQueueStats,
  PorkbunTaskSummary,
  resolvePorkbunBaseUrl,
  toWontonBatchRecord,
} from "../utils/porkbunApi";
import styles from "./BatchesPage.module.css";

const statusTone: Record<string, { background: string; border: string; color: string }> = {
  created: { background: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.35)", color: "#e2e8f0" },
  awaiting_input: { background: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.35)", color: "#fef3c7" },
  preparing_repo: { background: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.35)", color: "#bfdbfe" },
  submitted: { background: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.4)", color: "#dfe6ff" },
  queued: { background: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.35)", color: "#bfdbfe" },
  running: { background: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.35)", color: "#e9d5ff" },
  completed: { background: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.35)", color: "#bbf7d0" },
  failed: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.35)", color: "#fca5a5" },
  cancelled: { background: "rgba(148, 163, 184, 0.1)", border: "rgba(148, 163, 184, 0.3)", color: "#e2e8f0" },
  done: { background: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.35)", color: "#e2e8f0" },
  missing: { background: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.35)", color: "#fef3c7" },
  unavailable: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.35)", color: "#fecaca" },
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

type ServerState = "checking" | "running" | "idle" | "asleep" | "error";

function getServerState(health: PorkbunHealthStatus | null, queueStats: PorkbunQueueStats | null): ServerState {
  if (!health) {
    return "checking";
  }

  const normalizedStatus = String(health.status ?? "").trim().toLowerCase();
  const isErrorStatus = /error|unhealthy|down|fail|offline/.test(normalizedStatus);
  if (isErrorStatus) {
    return "error";
  }

  if ((queueStats?.running ?? 0) > 0) {
    return "running";
  }

  if (health.time_window_active) {
    return "idle";
  }

  return "asleep";
}

export default function BatchesPage() {
  const { settings } = useSettings();
  const { activeProjectId } = useNav();
  const { getProjectById } = useProjects();
  const { batches, remoteStatuses, isLoading: batchesLoading, syncBatches, persistBatch } = useBatches();
  const activeProject = activeProjectId ? getProjectById(activeProjectId) : undefined;

  const [health, setHealth] = useState<PorkbunHealthStatus | null>(null);
  const [queueStats, setQueueStats] = useState<PorkbunQueueStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [doneAtByTask, setDoneAtByTask] = useState<Record<string, string>>({});
  const [collapsedTasks, setCollapsedTasks] = useState<Record<string, boolean>>({});
  const [showOldDoneTasks, setShowOldDoneTasks] = useState(false);
  const [gitAvailable, setGitAvailable] = useState<boolean | null>(null);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [maxIterations, setMaxIterations] = useState(1);
  const refreshLockRef = useRef(false);
  const batchesRef = useRef(batches);
  const remoteStatusesRef = useRef(remoteStatuses);

  const terminalRemoteStatuses = useMemo(() => new Set(["completed", "failed", "cancelled", "done"]), []);

  useEffect(() => {
    batchesRef.current = batches;
  }, [batches]);

  useEffect(() => {
    remoteStatusesRef.current = remoteStatuses;
  }, [remoteStatuses]);

  const client = useMemo(() => {
    const baseUrl = resolvePorkbunBaseUrl(settings.porkbunServerUrl);
    return baseUrl ? new PorkbunClient({ baseUrl, apiKey: settings.porkbunApiKey || undefined }) : null;
  }, [settings.porkbunApiKey, settings.porkbunServerUrl]);

  const refreshData = useCallback(async () => {
    if (!client || refreshLockRef.current) return;
    refreshLockRef.current = true;
    setIsLoading(true);

    try {
      const [nextHealth, nextStats] = await Promise.all([
        client.fetchHealth(),
        client.fetchQueueStats(),
      ]);

      const pendingTaskIds = new Set(
        batchesRef.current
          .filter((task) => {
            const remoteStatus = remoteStatusesRef.current[task.id]?.status;
            return !task.done_at && !terminalRemoteStatuses.has(String(remoteStatus ?? ""));
          })
          .map((task) => task.id)
      );

      const pendingTaskDetails = pendingTaskIds.size
        ? await Promise.all(
            [...pendingTaskIds].map(async (taskId) => {
              try {
                return await client.fetchTask(taskId);
              } catch {
                return null;
              }
            })
          )
        : [];

      const mergedTasks = [...pendingTaskDetails.filter(Boolean)];

      setHealth(nextHealth);
      setQueueStats(nextStats);
      await syncBatches(mergedTasks as PorkbunTaskSummary[]);
    } catch (err) {
      const message = getErrorMessage(err, "Unable to load Porkbun data.");
      setError(message);
    } finally {
      refreshLockRef.current = false;
      setIsLoading(false);
    }
  }, [client, syncBatches, terminalRemoteStatuses]);

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

  const markBatchDoneLocally = useCallback(async (taskId: string) => {
    const task = batches.find((entry) => entry.id === taskId);
    if (!task) return;

    const now = new Date().toISOString();
    await persistBatch({
      ...task,
      done_at: now,
      updated_at: now,
    });
    markTaskDone(taskId);
    await refreshData();
  }, [batches, markTaskDone, persistBatch, refreshData]);

  const toggleTaskCollapsed = useCallback((taskId: string) => {
    setCollapsedTasks((prev) => ({
      ...prev,
      [taskId]: !(prev[taskId] ?? true),
    }));
  }, []);

  const handleDownloadZip = useCallback(async (taskId: string, titleText?: string | null) => {
    if (!client) return;
    setBusyId(taskId);
    setError(null);

    try {
      const resolvedPath = await client.downloadTaskZip(taskId, titleText ? `${titleText.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase()}.zip` : undefined);
      if (resolvedPath) {
        await markBatchDoneLocally(taskId);
        markTaskDone(taskId);
      }
    } catch (err) {
      const message = getErrorMessage(err, "ZIP download failed.");
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

      await markBatchDoneLocally(taskId);
      markTaskDone(taskId);
    } catch (err) {
      const message = getErrorMessage(err, "Patch application failed.");
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [activeProject?.folderPath, client, gitAvailable, markTaskDone, refreshData]);

  const handleActivateQueue = useCallback(async () => {
    if (!client) return;
    setBusyId("activate");
    try {
      const config = await client.fetchQueueConfig();
      const startTime = Number.isFinite(config.start_time) ? config.start_time : config.start_hour ?? 9;
      const endTime = Number.isFinite(config.end_time) ? config.end_time : config.end_hour ?? 17;

      await client.activateQueueNow({
        startTime,
        endTime,
      });
      await refreshData();
    } catch (err) {
      const message = getErrorMessage(err, "Queue activation failed.");
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [client, refreshData]);

  const handleCreateBatch = useCallback(async () => {
    if (!client) return;
    if (!activeProject?.folderPath) {
      setError("Select a project with a local folder before creating a batch.");
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError("A prompt is required before creating a batch.");
      return;
    }

    const normalizedMaxIterations = Number.parseInt(String(maxIterations), 10);
    if (!Number.isFinite(normalizedMaxIterations) || normalizedMaxIterations < 1) {
      setError("Max iterations must be a whole number greater than or equal to 1.");
      return;
    }

    const userTitle = trimmedTitle || undefined;

    setCreating(true);
    setError(null);

    try {
      const created = await client.createTask({
        title: userTitle,
        prompt: trimmedPrompt,
        model: settings.porkbunModelId || "gpt-4o-mini",
        llmServer: settings.porkbunLlmServerId || undefined,
        maxIterations: normalizedMaxIterations,
        projectFolderPath: activeProject.folderPath,
      });

      const nextBatch = toWontonBatchRecord(created, {
        title: userTitle ?? created.title ?? null,
        task: {
          ...(created.task ?? {}),
          user_prompt: trimmedPrompt,
          max_iterations: normalizedMaxIterations,
        },
      });

      setTitle("");
      setPrompt("");
      setMaxIterations(1);
      await persistBatch(nextBatch);
      await refreshData();
    } catch (err) {
      const message = getErrorMessage(err, "Batch creation failed.");
      setError(message);
    } finally {
      setCreating(false);
    }
  }, [activeProject?.folderPath, client, maxIterations, persistBatch, prompt, refreshData, settings.porkbunLlmServerId, settings.porkbunModelId, title]);

  const handleTaskAction = useCallback(async (taskId: string, action: "run" | "cancel" | "retry") => {
    if (!client) return;
    setBusyId(taskId);
    setError(null);

    const task = batches.find((entry) => entry.id === taskId);

    try {
      if (action === "run") {
        await client.runTaskNow(taskId);
      } else if (action === "cancel") {
        try {
          await client.cancelTask(taskId);
        } catch (cancelErr) {
          const now = new Date().toISOString();
          const message = getErrorMessage(cancelErr, "Remote cancellation failed, but the batch was marked done locally.");

          if (task) {
            await persistBatch({
              ...task,
              done_at: now,
              updated_at: now,
              error_message: message,
            });
          }

          setError(message);
          await refreshData();
          return;
        }
      } else {
        await client.retryTask(taskId);
      }
      await refreshData();
    } catch (err) {
      const message = getErrorMessage(err, "Task action failed.");
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [batches, client, persistBatch, refreshData]);

  const handleDismissTask = useCallback(async (taskId: string) => {
    const task = batches.find((entry) => entry.id === taskId);
    if (!task) return;

    setBusyId(taskId);
    setError(null);

    try {
      const now = new Date().toISOString();
      await persistBatch({
        ...task,
        done_at: now,
        updated_at: now,
      });
      await refreshData();
    } catch (err) {
      const message = getErrorMessage(err, "Failed to dismiss batch.");
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [batches, persistBatch, refreshData]);

  const handleCompletedTaskDone = useCallback(async (taskId: string) => {
    const task = batches.find((entry) => entry.id === taskId);
    if (!task) return;

    setBusyId(taskId);
    setError(null);

    try {
      await markBatchDoneLocally(taskId);
    } catch (err) {
      const message = getErrorMessage(err, "Failed to mark completed batch as done.");
      setError(message);
    } finally {
      setBusyId(null);
    }
  }, [batches, markBatchDoneLocally]);

  const sortedTasks = useMemo(
    () => [...batches].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()),
    [batches]
  );

  const hiddenOldDoneTasks = useMemo(
    () =>
      sortedTasks.filter((task) => {
        const doneAt = task.done_at ?? doneAtByTask[task.id] ?? null;
        if (!doneAt) return false;
        return Date.now() - new Date(doneAt).getTime() > 30 * 60 * 1000;
      }),
    [doneAtByTask, sortedTasks]
  );

  const visibleTasks = useMemo(
    () => {
      if (showOldDoneTasks) {
        return sortedTasks;
      }

      return sortedTasks.filter((task) => {
        const doneAt = task.done_at ?? doneAtByTask[task.id] ?? null;
        if (!doneAt) return true;
        return Date.now() - new Date(doneAt).getTime() <= 30 * 60 * 1000;
      });
    },
    [doneAtByTask, showOldDoneTasks, sortedTasks]
  );

  const getEffectiveStatus = useCallback((task: { id: string; done_at?: string | null; created_at?: string | null; updated_at?: string | null; error_message?: string | null }, remoteStatus?: { status?: string | null }) => {
    if (task.done_at) return "done";
    if (!remoteStatus) {
      return "created";
    }
    if (remoteStatus.status === "missing") return "missing";
    if (remoteStatus.status === "unavailable") return "unavailable";
    return remoteStatus.status || "created";
  }, []);

  const activeQueueTotal = queueStats ? queueStats.submitted + queueStats.queued + queueStats.running : health?.queue_len ?? 0;
  const serverState = useMemo(() => getServerState(health, queueStats), [health, queueStats]);

  const serverStateLabel = useMemo(() => {
    switch (serverState) {
      case "running":
        return "Running";
      case "idle":
        return "Idle";
      case "asleep":
        return "Asleep";
      case "error":
        return "Error";
      default:
        return "Checking";
    }
  }, [serverState]);

  const serverStateTone: Record<ServerState, { background: string; border: string; color: string }> = useMemo(
    () => ({
      checking: { background: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.35)", color: "#dfe6ff" },
      running: { background: "rgba(168, 85, 247, 0.12)", border: "rgba(168, 85, 247, 0.35)", color: "#e9d5ff" },
      idle: { background: "rgba(34, 197, 94, 0.12)", border: "rgba(34, 197, 94, 0.35)", color: "#bbf7d0" },
      asleep: { background: "rgba(148, 163, 184, 0.12)", border: "rgba(148, 163, 184, 0.35)", color: "#e2e8f0" },
      error: { background: "rgba(239, 68, 68, 0.12)", border: "rgba(239, 68, 68, 0.35)", color: "#fecaca" },
    }),
    []
  );

  const serverErrorMessage = useMemo(() => {
    if (serverState !== "error") {
      return null;
    }

    if (health && String(health.status ?? "").trim()) {
      return `Batch server is ${statusLabel(String(health.status))}.`;
    }

    return "Batch server is in an error state.";
  }, [health, serverState]);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.headerTitle}>
            <Waypoints size={20} />
            <h2>Batch Agent</h2>
          </div>
        </div>

        {!client ? (
          <div className={styles.notice}>Configure a Porkbun server URL in settings to enable the batch queue.</div>
        ) : (
          <>
            <div className={styles.statusRow}>
              <div className={styles.statusInfo}>
                <div
                  className={styles.statusPill}
                  style={{
                    background: serverStateTone[serverState].background,
                    borderColor: serverStateTone[serverState].border,
                    color: serverStateTone[serverState].color,
                  }}
                >
                  {serverStateLabel}
                </div>
                <div className={styles.statusMeta}>Queue depth: {activeQueueTotal}</div>
              </div>

              <div className={styles.statusActions}>
                <button className={styles.secondaryButton} onClick={() => void refreshData()} disabled={isLoading || !client}>
                  {isLoading || batchesLoading ? <Loader2 size={14} className="spin" /> : <RefreshCcw size={14} />}
                  Refresh
                </button>
                {serverState === "asleep" && (
                  <button className={styles.primaryButton} onClick={() => void handleActivateQueue()} disabled={busyId === "activate" || !client || batchesLoading}>
                    {busyId === "activate" ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                    Activate Queue
                  </button>
                )}
              </div>
            </div>

            {(error || serverErrorMessage) && (
              <div className={`${styles.notice} ${styles.noticeError}`}>
                <AlertCircle size={16} />
                <span>{error || serverErrorMessage}</span>
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
              {visibleTasks.length === 0 && hiddenOldDoneTasks.length === 0 ? (
                <div className={styles.emptyState}>No batches yet. Create the first queued task above.</div>
              ) : (
                <>
                  {visibleTasks.map((task) => {
                    const remoteStatus = remoteStatuses[task.id];
                    const effectiveStatus = getEffectiveStatus(task, remoteStatus);
                    const tone = statusTone[effectiveStatus] ?? statusTone.queued;
                    const isDoneTask = effectiveStatus === "done";
                    const isCollapsed = isDoneTask && (collapsedTasks[task.id] ?? true);
                    const canRun = ["created", "submitted", "queued", "awaiting_input", "preparing_repo"].includes(effectiveStatus);
                    const canCancel = ["created", "submitted", "queued", "running", "awaiting_input", "preparing_repo"].includes(effectiveStatus);
                    const canRetry = effectiveStatus === "failed" || effectiveStatus === "cancelled";
                    const canDismiss = effectiveStatus === "failed" || effectiveStatus === "completed";
                    const canDownload = ["completed", "failed", "done"].includes(effectiveStatus);
                    const canApplyPatch = canDownload && gitAvailable !== false && Boolean(activeProject?.folderPath);

                    return (
                      <div key={task.id} className={styles.taskCard}>
                        <div className={styles.taskHeader}>
                          <div className={styles.taskTitleRow}>
                            {isDoneTask && (
                              <button
                                type="button"
                                className={styles.taskCollapseToggle}
                                onClick={() => toggleTaskCollapsed(task.id)}
                                aria-label={isCollapsed ? "Expand batch" : "Collapse batch"}
                                aria-expanded={!isCollapsed}
                              >
                                {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                              </button>
                            )}
                            <h3 className={`${styles.taskTitle} ${isCollapsed ? styles.taskTitleDoneCollapsed : ""}`}>
                              {task.task?.user_prompt ? task.title || "Batch" : task.title || "Batch"}
                            </h3>
                          </div>
                          <span
                            className={styles.statusBadge}
                            style={{
                              background: tone.background,
                              borderColor: tone.border,
                              color: tone.color,
                            }}
                          >
                            {statusLabel(effectiveStatus)}
                          </span>
                        </div>

                        {isCollapsed ? (
                          <div className={styles.taskCollapsedMeta}>
                            {task.done_at ? <span>Done: {formatTimestamp(task.done_at)}</span> : <span>Completed</span>}
                          </div>
                        ) : (
                          <>
                            <div className={styles.taskMeta}>
                              <span>Created: {formatTimestamp(task.created_at)}</span>
                              <span>Updated: {formatTimestamp(task.updated_at)}</span>
                              {task.done_at && <span>Done: {formatTimestamp(task.done_at)}</span>}
                              {remoteStatus && <span>Remote: {statusLabel(remoteStatus.status)}</span>}
                            </div>

                            <p className={styles.taskPrompt}>{task.task?.user_prompt || "No prompt provided."}</p>

                            {(task.error_message || remoteStatus?.error_message) && <p className={styles.taskError}>{task.error_message || remoteStatus?.error_message}</p>}

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

                              {canDismiss && (
                                <button
                                  className={styles.actionButton}
                                  type="button"
                                  onClick={() => {
                                    if (effectiveStatus === "completed") {
                                      void handleCompletedTaskDone(task.id);
                                      return;
                                    }
                                    void handleDismissTask(task.id);
                                  }}
                                  disabled={busyId === task.id}
                                >
                                  {busyId === task.id ? <Loader2 size={14} className="spin" /> : <X size={14} />}
                                  {effectiveStatus === "completed" ? "" : "Dismiss"}
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
                          </>
                        )}
                      </div>
                    );
                  })}

                  {hiddenOldDoneTasks.length > 0 && (
                    <button
                      type="button"
                      className={styles.showOlderButton}
                      onClick={() => setShowOldDoneTasks((prev) => !prev)}
                    >
                      {showOldDoneTasks
                        ? "Hide older completed batches"
                        : `Show ${hiddenOldDoneTasks.length} older completed batch${hiddenOldDoneTasks.length === 1 ? "" : "es"}`}
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
