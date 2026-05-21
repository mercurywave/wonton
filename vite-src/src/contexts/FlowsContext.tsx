import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { Flow } from "../types/chat";
import { loadDisabledFlows, updateDisabledFlows } from "../hooks/useChatPersistence";
import { useNav } from "./NavContext";

interface FlowsContextValue {
  flows: Flow[];
  disabledFlows: string[];
  isLoading: boolean;
  refreshFlows: () => Promise<void>;
  flowsPath: string;
  toggleFlow: (flowId: string) => Promise<void>;
}

const FlowsContext = createContext<FlowsContextValue | null>(null);

export function FlowsProvider({ children }: { children: ReactNode }) {
  const { state: nav } = useNav();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [disabledFlows, setDisabledFlows] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [flowsPath, setFlowsPath] = useState("");

  const loadFlows = async () => {
    if (!nav.projectId) return;

    setIsLoading(true);
    try {
      const disabled = await loadDisabledFlows(nav.projectId);
      setDisabledFlows(disabled);
    } catch {
      setDisabledFlows([]);
    }

    try {
      const { loadFlowsFromDisk } = await import("../hooks/useFlows");
      const result = await loadFlowsFromDisk();
      setFlows(result.flows);
      setFlowsPath(result.flowsPath);
    } catch {
      setFlows([]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadFlows();
  }, [nav.projectId]);

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

  const value = useMemo(
    () => ({
      flows,
      disabledFlows,
      isLoading,
      refreshFlows,
      flowsPath,
      toggleFlow,
    }),
    [flows, disabledFlows, isLoading, flowsPath]
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
