import { useState, useEffect, useCallback } from "react";
import { PorkbunTaskSummary } from "../utils/porkbunApi";
import { batchStore } from "../store/batches";

export function useBatchesData(projectId: string | undefined) {
  const [batches, setBatches] = useState<PorkbunTaskSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!projectId) {
      setBatches([]);
      return;
    }
    setBatches(batchStore.getBatches(projectId));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        setIsLoading(false);
        setBatches([]);
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
    async (batch: PorkbunTaskSummary) => {
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
    isLoading,
    syncBatches,
    persistBatch,
    deleteBatch,
  };
}
