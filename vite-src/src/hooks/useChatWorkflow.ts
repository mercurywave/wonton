import { useRef, useCallback, useMemo, useEffect } from "react";
import { Flow, FlowState, Won, WorkflowStateContext } from "../types/chat";

interface UseChatWorkflowOptions {
  workflowId?: string;
  workflowStateKey?: string;
  workflowData: Record<string, unknown>;
  flows: Flow[];
  chatId?: string;
  modelId?: string;
  updateChatMeta: (updates: {
    workflowStateKey?: string;
    workflowData?: Record<string, unknown>;
    updatedAt?: number;
  }) => Promise<void>;
  onStateChange?: (stateKey: string, data: Record<string, unknown>) => void;
}

interface UseChatWorkflowReturn {
  executeAdjustPrompt(userContent: string, modelId?: string): Promise<string>;
  currentFlow: Flow | undefined;
  currentState: FlowState | undefined;
  triggerOnEnterForState(stateKey: string, data: Record<string, unknown>): Promise<void>;
  advance(nextStateKey: string): Promise<void>;
}

function buildWon(
  ctx: WorkflowStateContext,
  updateChatMeta: UseChatWorkflowOptions["updateChatMeta"],
  onStateChange?: UseChatWorkflowOptions["onStateChange"],
  onEnterForState?: (stateKey: string, data: Record<string, unknown>) => Promise<void>
): Won {
  const stateRef = { ...ctx };

  return {
    async advance(nextStateKey: string) {
      stateRef.stateKey = nextStateKey;
      await updateChatMeta({
        workflowStateKey: nextStateKey,
        workflowData: stateRef.workflowData,
        updatedAt: Date.now(),
      });
      onStateChange?.(nextStateKey, stateRef.workflowData);
      onEnterForState?.(nextStateKey, stateRef.workflowData);
    },
    getState() {
      return { ...stateRef };
    },
    async setWorkflowData(partial) {
      stateRef.workflowData = { ...stateRef.workflowData, ...partial };
      await updateChatMeta({
        workflowData: stateRef.workflowData,
        updatedAt: Date.now(),
      });
    },
  };
}

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const { workflowId, workflowStateKey, workflowData, flows, chatId, modelId, updateChatMeta, onStateChange } = options;

  const dataRef = useRef(workflowData);
  useEffect(() => {
    dataRef.current = workflowData;
  }, [workflowData]);

  const currentFlow = useMemo(() => flows.find((f) => f.id === workflowId), [flows, workflowId]);
  const currentState = useMemo(
    () => currentFlow?.states?.[workflowStateKey ?? ""],
    [currentFlow, workflowStateKey]
  );

  const runOnEnterForState = useCallback(async (stateKey: string, data: Record<string, unknown>) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[stateKey];
    if (!state?.onEnter || !chatId || !workflowId) return;

    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey,
      workflowData: data,
    };
    const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current);
    const hookFn = new Function("won", state.onEnter) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onEnter hook failed in state "${stateKey}":`, err);
    }
  }, [flows, workflowId, chatId, updateChatMeta, onStateChange]);

  const advance = useCallback(async (nextStateKey: string) => {
    await runOnEnterForState(nextStateKey, dataRef.current);
  }, [runOnEnterForState]);

  const onEnterForStateRef = useRef(runOnEnterForState);
  onEnterForStateRef.current = runOnEnterForState;

  const executeAdjustPrompt = useCallback(
    async (userContent: string, promptModelId?: string): Promise<string> => {
      if (!currentState?.hookAdjustPrompt || !chatId || !workflowId || !workflowStateKey) {
        return userContent;
      }

      const ctx: WorkflowStateContext = {
        chatId,
        workflowId,
        stateKey: workflowStateKey,
        workflowData: dataRef.current,
        modelId: promptModelId ?? modelId,
      };
      const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current);
      
      const hookfn = new Function("won", "userContent", currentState.hookAdjustPrompt) as unknown as (won: Won, userContent: string) => Promise<string>;
      try{
        const result = await hookfn(won, userContent);
        if (typeof result === "string") {
          return result;
        }
      } catch (err) {
        console.error(`hookAdjustPrompt failed in state "${workflowStateKey}":`, err);
      }
      return userContent;
    },
    [currentState, chatId, workflowId, workflowStateKey, updateChatMeta, onStateChange]
  );

  return {
    executeAdjustPrompt,
    currentFlow,
    currentState,
    triggerOnEnterForState: runOnEnterForState,
    advance,
  };
}
