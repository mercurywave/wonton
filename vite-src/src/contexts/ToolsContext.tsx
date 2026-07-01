import {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { ProjectCustomTool } from "../types/chat";
import { useNav } from "./NavContext";
import { toolStore } from "../store/tools";
import { filesystem } from "../utils/electronFs";

interface ToolsContextValue {
  tools: ProjectCustomTool[];
  isLoading: boolean;
  refreshTools: () => Promise<void>;
  toolsDirPath: string;
}

const ToolsContext = createContext<ToolsContextValue | null>(null);

export function ToolsProvider({ children }: { children: ReactNode }) {
  const { state: nav } = useNav();
  const [tools, setTools] = useState<ProjectCustomTool[]>(() => toolStore.getTools());
  const [isLoading, setIsLoading] = useState(true);
  const [toolsDirPath, setToolsDirPath] = useState(() => toolStore.getToolsDirPath());
  const watcherKeyRef = useRef<string>("");
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshCountRef = useRef(0);

  const loadTools = useCallback(async () => {
    const projectId = nav.projectId;
    if (!projectId) return;

    setIsLoading(true);
    await toolStore.refresh();
    setTools(toolStore.getTools());
    setToolsDirPath(toolStore.getToolsDirPath());
    setIsLoading(false);
  }, [nav.projectId]);

  useEffect(() => {
    let cancelled = false;
    let iifeCleanup: (() => void) | null = null;

    const scheduleRefresh = async () => {
      if (cancelled) return;
      refreshCountRef.current += 1;
      const currentCount = refreshCountRef.current;

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }

      refreshTimerRef.current = setTimeout(async () => {
        if (currentCount !== refreshCountRef.current) return;
        try {
          await toolStore.refresh();
          if (!cancelled) {
            setTools(toolStore.getTools());
            setToolsDirPath(toolStore.getToolsDirPath());
          }
        } catch {
          // ignore refresh errors
        }
      }, 500);
    };

    (async () => {
      setIsLoading(true);
      const projectId = nav.projectId;
      if (!projectId) {
        setIsLoading(false);
        return;
      }

      await toolStore.load(projectId);
      if (!cancelled) {
        await loadTools();
      }

      try {
        const toolsDir = toolStore.getToolsDirPath();
        if (toolsDir) {
          const result = await filesystem.watchDir(toolsDir);
          watcherKeyRef.current = result.watcherId;
        }
      } catch {
        // tools dir may not exist yet
      }

      const handler = (_event: any, ev: any) => {
        if (!ev || !ev.id) return;
        const watcherKey = ev.id;
        if (watcherKey !== watcherKeyRef.current) return;
        scheduleRefresh();
      };

      window.electronAPI.events.on("watch:change", handler);

      const stopWatcher = async (key: string) => {
        if (key) {
          try {
            await filesystem.removeWatcher(key);
          } catch {
            // ignore cleanup errors
          }
        }
      };

      iifeCleanup = () => {
        window.electronAPI.events.off("watch:change", handler);

        if (refreshTimerRef.current) {
          clearTimeout(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }

        stopWatcher(watcherKeyRef.current);
      };
    })();

    const unsubscribe = toolStore.subscribe(() => {
      setTools(toolStore.getTools());
      setToolsDirPath(toolStore.getToolsDirPath());
    });

    return () => {
      cancelled = true;
      iifeCleanup?.();
      unsubscribe();
    };
  }, [loadTools, nav.projectId]);

  const refreshTools = async () => {
    await loadTools();
  };

  const value = useMemo(
    () => ({
      tools,
      isLoading,
      refreshTools,
      toolsDirPath,
    }),
    [tools, isLoading, toolsDirPath]
  );

  return <ToolsContext.Provider value={value}>{children}</ToolsContext.Provider>;
}

export function useToolsContext(): ToolsContextValue {
  const ctx = useContext(ToolsContext);
  if (!ctx) {
    throw new Error("useToolsContext must be used within a ToolsProvider");
  }
  return ctx;
}
