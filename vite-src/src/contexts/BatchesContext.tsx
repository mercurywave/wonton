import { createContext, useContext, useMemo, ReactNode } from "react";
import { useBatchesData } from "../hooks/useBatchesData";
import { useNav } from "./NavContext";
import { PorkbunTaskSummary } from "../utils/porkbunApi";
import { isBackendConnected } from "../utils/platformUtils";

interface BatchesContextValue {
  batches: PorkbunTaskSummary[];
  isLoading: boolean;
  syncBatches: (nextBatches: PorkbunTaskSummary[]) => Promise<void>;
  persistBatch: (batch: PorkbunTaskSummary) => Promise<void>;
  deleteBatch: (taskId: string) => Promise<void>;
}

const BatchesContext = createContext<BatchesContextValue | null>(null);

export function BatchesProvider({ children }: { children: ReactNode }) {
  const { activeProjectId } = useNav();

  const { batches, isLoading, syncBatches, persistBatch, deleteBatch } = useBatchesData(
    isBackendConnected() ? (activeProjectId ?? undefined) : undefined
  );

  const value = useMemo(
    () => ({
      batches,
      isLoading,
      syncBatches,
      persistBatch,
      deleteBatch,
    }),
    [batches, isLoading, syncBatches, persistBatch, deleteBatch]
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
