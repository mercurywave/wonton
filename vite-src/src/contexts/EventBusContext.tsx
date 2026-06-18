import {
  createContext,
  useContext,
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

const handlersRef: EventHandlers = {};

function emit(event: string, payload?: unknown) {
  const handlers = handlersRef[event];
  if (handlers) {
    for (const handler of handlers) handler(payload);
  }
}

function on(event: string, handler: (payload: unknown) => void): () => void {
  if (!handlersRef[event]) {
    handlersRef[event] = new Set();
  }
  handlersRef[event].add(handler);
  return () => {
    handlersRef[event]?.delete(handler);
  };
}

const EventBus = createContext<EventBusValue | null>(null);

export function EventBusProvider({ children }: { children: ReactNode }) {
  const emitCallback = useCallback((event: string, payload?: unknown) => {
    emit(event, payload);
  }, []);

  const onCallback = useCallback(
    (event: string, handler: (payload: unknown) => void) => {
      return on(event, handler);
    },
    []
  );

  const value = useMemo(
    () => ({ emit: emitCallback, on: onCallback }),
    [emitCallback, onCallback]
  );

  return <EventBus.Provider value={value}>{children}</EventBus.Provider>;
}

export { emit, on };

export function useEventBus(): EventBusValue {
  const ctx = useContext(EventBus);
  if (!ctx) {
    throw new Error("useEventBus must be used within an EventBusProvider");
  }
  return ctx;
}
