import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import { Flow } from "../types/chat";
import { loadDisabledFlows, updateDisabledFlows } from "../hooks/useChatPersistence";
import { useNav } from "./NavContext";
import { flowStore } from "../store/flows";

interface FlowsContextValue {
  flows: Flow[];
  disabledFlows: string[];
  enabledWorkflows: Flow[];
  commandFlows: Flow[];
  isLoading: boolean;
  refreshFlows: () => Promise<void>;
  flowsPath: string;
  toggleFlow: (flowId: string) => Promise<void>;
  conflictIds: string[];
  conflictFiles: Record<string, string>;
}

const FlowsContext = createContext<FlowsContextValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const { state: nav } = useNav();
  const [flows, setFlows] = useState<Flow[]>(() => flowStore.getFlows());
  const [disabledFlows, setDisabledFlows] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [flowsPath, setFlowsPath] = useState(() => flowStore.getFlowsPath());
  const [conflictIds, setConflictIds] = useState<string[]>(() => flowStore.getConflictIds());
  const [conflictFiles, setConflictFiles] = useState<Record<string, string>>(() => flowStore.getConflictFiles());

  const loadFlows = useCallback(async () => {
    if (!nav.projectId) return;

    setIsLoading(true);
    try {
      const disabled = await loadDisabledFlows(nav.projectId);
      setDisabledFlows(disabled);
    } catch {
      setDisabledFlows([]);
    }

    await flowStore.refresh();
    setFlows(flowStore.getFlows());
    setFlowsPath(flowStore.getFlowsPath());
    setConflictIds(flowStore.getConflictIds());
    setConflictFiles(flowStore.getConflictFiles());
    setIsLoading(false);
  }, [nav.projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await flowStore.load();
      if (!cancelled) {
        await loadFlows();
      }
    })();

    const unsubscribe = flowStore.subscribe(() => {
      setFlows(flowStore.getFlows());
      setFlowsPath(flowStore.getFlowsPath());
      setConflictIds(flowStore.getConflictIds());
      setConflictFiles(flowStore.getConflictFiles());
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadFlows]);

  const refreshFlows = async () => {
    await loadFlows();
  };

  const toggleFlow = async (flowId: string) => {
    const next = disabledFlows.includes(flowId)
      ? disabledFlows.filter((id) => id !== flowId)
      : [...disabledFlows, flowId];
    setDisabledFlows(next);
    if (nav.projectId) {
      await updateDisabledFlows(nav.projectId, next);
    }
  };

  const enabledWorkflows = useMemo(
    () => flows.filter((f) => !disabledFlows.includes(f.id)),
    [flows, disabledFlows]
  );

  const commandFlows = useMemo(
    () => flows.filter((f) => (f as any).isCommand),
    [flows]
  );

  const value = useMemo(
    () => ({
      flows,
      disabledFlows,
      enabledWorkflows,
      commandFlows,
      isLoading,
      refreshFlows,
      flowsPath,
      toggleFlow,
      conflictIds,
      conflictFiles,
    }),
    [flows, disabledFlows, enabledWorkflows, commandFlows, isLoading, flowsPath, conflictIds, conflictFiles]
  );

  return <FlowsContext.Provider value={value}>{children}</FlowsContext.Provider>;
}

export function useFlowsContext(): FlowsContextValue {
  const ctx = useContext(FlowsContext);
  if (!ctx) {
    throw new Error("useFlowsContext must be used within a FlowsProvider");
  }
  return ctx;
}
