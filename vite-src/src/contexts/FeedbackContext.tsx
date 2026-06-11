import {
  createContext,
  useContext,
  useRef,
  useCallback,
  useMemo,
  ReactNode,
  useState,
} from "react";

export type FeedbackType = "alert" | "select";

export interface AlertPayload {
  type: "alert";
  message: string;
}

export interface SelectPayload {
  type: "select";
  question: string;
  choices: string[];
}

export type FeedbackPayload = AlertPayload | SelectPayload;

interface PendingFeedback {
  resolve: (value: number | void) => void;
  reject: (reason?: unknown) => void;
  payload: FeedbackPayload;
}

interface ExtensionFeedbackValue {
  showFeedback: (payload: FeedbackPayload) => Promise<number | void>;
  pendingFeedback: PendingFeedback | null;
  dismiss: () => void;
  selectChoice: (index: number) => void;
}

const ExtensionFeedback = createContext<ExtensionFeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef<PendingFeedback | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<PendingFeedback | null>(null);

  const showFeedback = useCallback((payload: FeedbackPayload): Promise<number | void> => {
    return new Promise<number | void>((resolve, reject) => {
      pendingRef.current = { resolve, reject, payload };
      setPendingFeedback(pendingRef.current);
    });
  }, []);

  const dismiss = useCallback(() => {
    if (pendingRef.current) {
      const { resolve, payload } = pendingRef.current;
      if (payload.type === "alert") {
        resolve(undefined);
      }
      pendingRef.current = null;
      setPendingFeedback(null);
    }
  }, []);

  const selectChoice = useCallback((index: number) => {
    if (pendingRef.current) {
      const { resolve, payload } = pendingRef.current;
      if (payload.type === "select") {
        resolve(index);
      }
      pendingRef.current = null;
      setPendingFeedback(null);
    }
  }, []);

  const value = useMemo(
    () => ({ showFeedback, pendingFeedback, dismiss, selectChoice }),
    [showFeedback, pendingFeedback, dismiss, selectChoice]
  );

  return (
    <ExtensionFeedback.Provider value={value}>
      {children}
    </ExtensionFeedback.Provider>
  );
}

export function useFeedback(): ExtensionFeedbackValue {
  const ctx = useContext(ExtensionFeedback);
  if (!ctx) {
    throw new Error("useExtensionFeedback must be used within an ExtensionFeedbackProvider");
  }
  return ctx;
}
