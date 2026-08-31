import { useState, useEffect, useCallback } from "react";
import { BatchRemoteCacheEntry, PorkbunTaskSummary, WontonBatchRecord } from "../utils/porkbunApi";
import { batchStore } from "../store/batches";

export function useBatchesData(projectId: string | undefined) {
  const [batches, setBatches] = useState<WontonBatchRecord[]>([]);
  const [remoteStatuses, setRemoteStatuses] = useState<Record<string, BatchRemoteCacheEntry>>({});
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!projectId) {
      setBatches([]);
      setRemoteStatuses({});
      return;
    }
    setBatches(batchStore.getBatches(projectId));
    setRemoteStatuses(batchStore.getRemoteStatuses(projectId));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        setIsLoading(false);
        setBatches([]);
        setRemoteStatuses({});
        return;
      }

      setIsLoading(true);
      await batchStore.load(projectId);
      if (!cancelled) {
        refresh();
        setIsLoading(false);
      }
    })();

    const unsubscribe = batchStore.subscribe(refresh);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, refresh]);

  const syncBatches = useCallback(
    async (nextBatches: PorkbunTaskSummary[]) => {
      if (!projectId) return;
      await batchStore.replaceAll(projectId, nextBatches);
      refresh();
    },
    [projectId, refresh]
  );

  const persistBatch = useCallback(
    async (batch: WontonBatchRecord | PorkbunTaskSummary) => {
      if (!projectId) return;
      await batchStore.upsertBatch(projectId, batch);
      refresh();
    },
    [projectId, refresh]
  );

  const deleteBatch = useCallback(
    async (taskId: string) => {
      if (!projectId) return;
      await batchStore.deleteBatch(projectId, taskId);
      refresh();
    },
    [projectId, refresh]
  );

  return {
    batches,
    remoteStatuses,
    isLoading,
    syncBatches,
    persistBatch,
    deleteBatch,
  };
}
