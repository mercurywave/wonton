import { useState, useEffect, useCallback } from "react";
import { isBackendConnected } from "../utils/platformUtils";
import { GitStatusEntry } from "../vite-env";

export function useGit(cwd?: string) {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [status, setStatus] = useState<GitStatusEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remote, setRemote] = useState<{ cwd: string; url: string } | null>(null);
  const remoteUrl = remote && remote.cwd === cwd ? remote.url : "";
  const [commitsAhead, setCommitsAhead] = useState<number>(0);

  const refresh = useCallback(async () => {
    if (!cwd || !isBackendConnected()) {
      setIsAvailable(null);
      setStatus([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const available = await window.electronAPI.git.isAvailable(cwd);
      setIsAvailable(available);

      if (available) {
        const statusData = await window.electronAPI.git.getStatus(cwd);
        setStatus(statusData);
      }
    } catch (err) {
      console.error("Failed to get git status:", err);
      setError(err instanceof Error ? err.message : "Failed to get git status");
      setIsAvailable(false);
      setStatus([]);
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const commit = useCallback(async (message: string) => {
    if (!cwd || !isBackendConnected()) {
      return { success: false, error: "No active project folder" };
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.git.commit(cwd, message);
      if (result.success) {
        await refresh();
      } else {
        setError(result.error || "Commit failed");
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Commit failed";
      setError(errorMsg);
      return { success: false, error: errorMsg, stdout: "", stderr: "" };
    } finally {
      setLoading(false);
    }
  }, [cwd, refresh]);

  const sync = useCallback(async () => {
    if (!cwd || !isBackendConnected()) {
      return { success: false, error: "No active project folder" };
    }

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.git.sync(cwd);
      if (result.success) {
        await refresh();
      } else {
        setError(result.error || "Sync failed");
      }
      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Sync failed";
      setError(errorMsg);
      return { success: false, error: errorMsg, stdout: "", stderr: "" };
    } finally {
      setLoading(false);
    }
  }, [cwd, refresh]);

  useEffect(() => {
    let cancelled = false;

    if (!cwd || !isBackendConnected()) {
      return;
    }

    window.electronAPI.git.getRemoteUrl(cwd)
      .then(url => {
        if (!cancelled) setRemote({ cwd, url });
      })
      .catch(() => {
        if (!cancelled) setRemote({ cwd, url: "" });
      });

    return () => { cancelled = true; };
  }, [cwd]);

  useEffect(() => {
    let cancelled = false;

    if (!cwd || !isBackendConnected()) {
      return;
    }

    window.electronAPI.git.getCommitsAheadCount(cwd)
      .then(count => {
        if (!cancelled) setCommitsAhead(count);
      })
      .catch(() => {
        if (!cancelled) setCommitsAhead(0);
      });

    return () => { cancelled = true; };
  }, [cwd]);

  return {
    isAvailable,
    status,
    loading,
    error,
    refresh,
    commit,
    sync,
    remoteUrl,
    commitsAhead,
  };
}
