import { createContext, useContext, useMemo, ReactNode } from "react";
import { useBatchesData } from "../hooks/useBatchesData";
import { useNav } from "./NavContext";
import { BatchRemoteCacheEntry, PorkbunTaskSummary, WontonBatchRecord } from "../utils/porkbunApi";
import { isBackendConnected } from "../utils/platformUtils";

interface BatchesContextValue {
  batches: WontonBatchRecord[];
  remoteStatuses: Record<string, BatchRemoteCacheEntry>;
  isLoading: boolean;
  syncBatches: (nextBatches: PorkbunTaskSummary[]) => Promise<void>;
  persistBatch: (batch: WontonBatchRecord) => Promise<void>;
  deleteBatch: (taskId: string) => Promise<void>;
}

const BatchesContext = createContext<BatchesContextValue | null>(null);

export function BatchesProvider({ children }: { children: ReactNode }) {
  const { activeProjectId } = useNav();

  const { batches, remoteStatuses, isLoading, syncBatches, persistBatch, deleteBatch } = useBatchesData(
    isBackendConnected() ? (activeProjectId ?? undefined) : undefined
  );

  const value = useMemo(
    () => ({
      batches,
      remoteStatuses,
      isLoading,
      syncBatches,
      persistBatch,
      deleteBatch,
    }),
    [batches, remoteStatuses, isLoading, syncBatches, persistBatch, deleteBatch]
  );

  return <BatchesContext.Provider value={value}>{children}</BatchesContext.Provider>;
}

export function useBatches(): BatchesContextValue {
  const ctx = useContext(BatchesContext);
  if (!ctx) {
    throw new Error("useBatches must be used within a BatchesProvider");
  }
  return ctx;
}
