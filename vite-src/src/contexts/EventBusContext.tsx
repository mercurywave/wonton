import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
} from "react";

interface EventHandlers {
  [event: string]: Set<(payload: unknown) => void>;
}

interface EventBusValue {
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload: unknown) => void) => () => void;
}

const EventBus = createContext<EventBusValue | null>(null);

export function EventBusProvider({ children }: { children: ReactNode }) {
  const handlersRef = useRef<EventHandlers>({});

  const emit = useCallback((event: string, payload?: unknown) => {
    const handlers = handlersRef.current[event];
    setTimeout(() => {
      if (handlers) {
        for (const handler of handlers) handler(payload);
      }
    });
  }, []);

  const on = useCallback(
    (event: string, handler: (payload: unknown) => void) => {
      if (!handlersRef.current[event]) {
        handlersRef.current[event] = new Set();
      }
      handlersRef.current[event].add(handler);
      return () => {
        handlersRef.current[event]?.delete(handler);
      };
    },
    []
  );

  const value = useMemo(
    () => ({ emit, on }),
    [emit, on]
  );

  return <EventBus.Provider value={value}>{children}</EventBus.Provider>;
}

export function useEventBus(): EventBusValue {
  const ctx = useContext(EventBus);
  if (!ctx) {
    throw new Error("useEventBus must be used within an EventBusProvider");
  }
  return ctx;
}
