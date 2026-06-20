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
import { useNav } from "./NavContext";
import { flowStore } from "../store/flows";
import { projectMetaStore } from "../store/projectMeta";

interface FlowsContextValue {
  flows: Flow[];
  disabledFlows: string[];
  enabledWorkflows: Flow[];
  commandFlows: Flow[];
  isLoading: boolean;
  refreshFlows: () => Promise<void>;
  globalFlowsPath: string;
  projectFlowsPath: string;
  toggleFlow: (flowId: string) => Promise<void>;
  conflictIds: string[];
  conflictFiles: Record<string, string>;
  overriddenGlobalIds: string[];
}

const FlowsContext = createContext<FlowsContextValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const { state: nav } = useNav();
  const [flows, setFlows] = useState<Flow[]>(() => flowStore.getFlows());
  const [disabledFlows, setDisabledFlows] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [globalFlowsPath, setGlobalFlowsPath] = useState(() => flowStore.getGlobalFlowsPath());
  const [projectFlowsPath, setProjectFlowsPath] = useState(() => flowStore.getProjectFlowsPath());
  const [conflictIds, setConflictIds] = useState<string[]>(() => flowStore.getConflictIds());
  const [conflictFiles, setConflictFiles] = useState<Record<string, string>>(() => flowStore.getConflictFiles());
  const [overriddenGlobalIds, setOverriddenGlobalIds] = useState<string[]>(() => flowStore.getOverriddenGlobalIds());

  const loadFlows = useCallback(async () => {
    const projectId = nav.projectId;
    if (!projectId) return;

    setIsLoading(true);
    try {
      await projectMetaStore.load(projectId);
      const meta = projectMetaStore.getProjectMeta(projectId);
      setDisabledFlows(meta?.disabledFlows ?? []);
    } catch {
      setDisabledFlows([]);
    }

    await flowStore.refresh();
    setFlows(flowStore.getFlows());
    setGlobalFlowsPath(flowStore.getGlobalFlowsPath());
    setProjectFlowsPath(flowStore.getProjectFlowsPath());
    setConflictIds(flowStore.getConflictIds());
    setConflictFiles(flowStore.getConflictFiles());
    setOverriddenGlobalIds(flowStore.getOverriddenGlobalIds());
    setIsLoading(false);
  }, [nav.projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await flowStore.load(nav.projectId ?? "");
      if (!cancelled) {
        await loadFlows();
      }
    })();

    const unsubscribe = flowStore.subscribe(() => {
      setFlows(flowStore.getFlows());
      setGlobalFlowsPath(flowStore.getGlobalFlowsPath());
      setProjectFlowsPath(flowStore.getProjectFlowsPath());
      setConflictIds(flowStore.getConflictIds());
      setConflictFiles(flowStore.getConflictFiles());
      setOverriddenGlobalIds(flowStore.getOverriddenGlobalIds());
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadFlows, nav.projectId]);

  useEffect(() => {
    const projectId = nav.projectId;
    if (!projectId) return;
    const unsub = projectMetaStore.subscribe(projectId, () => {
      const meta = projectMetaStore.getProjectMeta(projectId);
      setDisabledFlows(meta?.disabledFlows ?? []);
    });
    return unsub;
  }, [nav.projectId]);

  const refreshFlows = async () => {
    await loadFlows();
  };

  const toggleFlow = async (flowId: string) => {
    const next = disabledFlows.includes(flowId)
      ? disabledFlows.filter((id) => id !== flowId)
      : [...disabledFlows, flowId];
    setDisabledFlows(next);
    const projectId = nav.projectId;
    if (projectId) {
      await projectMetaStore.setDisabledFlows(projectId, next);
    }
  };

  const enabledWorkflows = useMemo(
    () => {
      const seen = new Set<string>();
      const unique: Flow[] = [];
      for (const f of flows) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          unique.push(f);
        }
      }
      return unique.filter((f) => !disabledFlows.includes(f.id));
    },
    [flows, disabledFlows]
  );

  const commandFlows = useMemo(
    () => {
      const seen = new Set<string>();
      const unique: Flow[] = [];
      for (const f of flows) {
        if (!seen.has(f.id) && (f as any).isCommand) {
          seen.add(f.id);
          unique.push(f);
        }
      }
      return unique;
    },
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
      globalFlowsPath,
      projectFlowsPath,
      toggleFlow,
      conflictIds,
      conflictFiles,
      overriddenGlobalIds,
    }),
    [flows, disabledFlows, enabledWorkflows, commandFlows, isLoading, globalFlowsPath, projectFlowsPath, conflictIds, conflictFiles, overriddenGlobalIds]
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
