import {
  createContext,
  useContext,
  useCallback,
  useMemo,
  ReactNode,
  useState,
} from "react";
import {
  queueApproval,
  dequeueApproval,
  getFirstPendingApprovalAcrossAllChats,
  ApprovalRequest,
} from "../store/chats";

export type FeedbackType = "alert" | "select" | "text";

export interface AlertPayload {
  type: "alert";
  message: string;
}

export interface SelectPayload {
  type: "select";
  question: string;
  choices: string[];
}

export interface TextPayload {
  type: "text";
  question: string;
  placeholder?: string;
}

export type FeedbackPayload = AlertPayload | SelectPayload | TextPayload;

interface ExtensionFeedbackValue {
  showFeedback: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>;
  currentRequest: ApprovalRequest | null;
  currentPayload: FeedbackPayload | null;
  dismiss: () => void;
  selectChoice: (index: number) => void;
}

const ExtensionFeedback = createContext<ExtensionFeedbackValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [currentRequest, setCurrentRequest] = useState<ApprovalRequest | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  const showFeedback = useCallback(
    (projectId: string, chatId: string, logId: string, payload: FeedbackPayload): Promise<number | string | void> => {
      setProjectId(projectId);
      return new Promise<number | string | void>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        const request: ApprovalRequest = {
          requestId,
          chatId,
          logId,
          payload,
          resolve,
          reject,
        };
        queueApproval(projectId, request);
        // If there's no current request being handled, show this one immediately
        setCurrentRequest((prev) => {
          if (prev) return prev; // already showing something
          return request;
        });
      });
    },
    []
  );

  const dismiss = useCallback(() => {
    if (!currentRequest || !projectId) return;
    dequeueApproval(projectId, currentRequest.chatId, undefined);
    setCurrentRequest(null);
    // Pick up next from store queue after state settles
    setTimeout(() => {
      const next = getFirstPendingApprovalAcrossAllChats(projectId);
      if (next) {
        setCurrentRequest(next);
      }
    }, 0);
  }, [currentRequest, projectId]);

  const selectChoice = useCallback((index: number) => {
    if (!currentRequest || !projectId) return;
    dequeueApproval(projectId, currentRequest.chatId, index);
    setCurrentRequest(null);
    // Pick up next from store queue after state settles
    setTimeout(() => {
      const next = getFirstPendingApprovalAcrossAllChats(projectId);
      if (next) {
        setCurrentRequest(next);
      }
    }, 0);
  }, [currentRequest, projectId]);

  const value = useMemo(
    () => ({ showFeedback, currentRequest, currentPayload: currentRequest?.payload ?? null, dismiss, selectChoice }),
    [showFeedback, currentRequest, dismiss, selectChoice]
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
    throw new Error("useFeedback must be used within an FeedbackProvider");
  }
  return ctx;
}
