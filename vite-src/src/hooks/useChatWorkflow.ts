import { useRef, useCallback, useMemo, useEffect } from "react";
import { ChatMessage, ChatMeta, Flow, FlowState, FlowActionButton, TempFileReservation, Won, WorkflowStateContext } from "../types/chat";
import { generateUniqueFileName, getProjectDataDir } from "../utils/neuUtils";
import { useEventBus } from "../contexts";

interface UseChatWorkflowOptions {
  workflowId?: string;
  workflowStateKey?: string;
  workflowData: Record<string, unknown>;
  flows: Flow[];
  chatId?: string;
  modelId?: string;
  projectId?: string;
  folderPath?: string;
  updateChatMeta: (updates: Partial<ChatMeta>) => Promise<void>;
  onStateChange?: (stateKey: string, data: Record<string, unknown>) => void;
}

interface UseChatWorkflowReturn {
  executeAdjustPrompt(userContent: string, modelId?: string): Promise<string>;
  onSendPrompt(): Promise<void>;
  onChatResponse(response: ChatMessage): Promise<void>;
  onActionButtonClick(button: FlowActionButton): Promise<void>;
  currentFlow: Flow | undefined;
  currentState: FlowState | undefined;
  triggerOnEnterForState(stateKey: string, data: Record<string, unknown>): Promise<void>;
  advance(nextStateKey: string): Promise<void>;
}

function buildWon(
  ctx: WorkflowStateContext,
  updateChatMeta: UseChatWorkflowOptions["updateChatMeta"],
  onStateChange?: UseChatWorkflowOptions["onStateChange"],
  onEnterForState?: (stateKey: string, data: Record<string, unknown>) => Promise<void>,
  projectId?: string,
  folderPath?: string,
  emit?: (event: string, payload?: unknown) => void,
): Won {
  const stateRef = { ...ctx };

  async function reserveTempFile(baseName?: string): Promise<string> {
    const name = baseName ?? "temp.txt";
    const existing = (stateRef.workflowData.__reservedTempFiles as TempFileReservation[] | undefined) ?? [];

    const nextBase = (() => {
      const matching = existing.filter((r) => r.baseName === name);
      if (matching.length === 0) return name;
      const nextIndex = matching.length + 1;
      return `${name} (${nextIndex})`;
    })();

    const folders: string[] = [];
    if (projectId) {
      const dataDir = await getProjectDataDir(projectId);
      if (dataDir) {
        folders.push(`${dataDir}/tmp`);
      }
    }
    if (folderPath) {
      folders.push(folderPath);
    }

    const uniqueName = await generateUniqueFileName(name, folders);

    const updated = [...existing, { baseName: nextBase, uniqueName }];
    stateRef.workflowData.__reservedTempFiles = updated;
    await updateChatMeta({
      reservedTempFiles: updated,
      updatedAt: Date.now(),
    });

    return uniqueName;
  }

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
    reserveTempFile,
    openFile: (uniqueName: string) => {
      emit?.("requestOpenFile", { uniqueName });
    },
  };
}

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const { workflowId, workflowStateKey, workflowData, flows, chatId, modelId, projectId, folderPath, updateChatMeta, onStateChange } = options;
  const { emit } = useEventBus();

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
    const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current, projectId, folderPath, emit);
    const hookFn = new Function("won", `return (async () => {${state.onEnter}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onEnter hook failed in state "${stateKey}":`, err);
    }
  }, [flows, workflowId, chatId, updateChatMeta, onStateChange, projectId, folderPath, emit]);

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
      const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current, projectId, folderPath, emit);
      
      const hookfn = new Function("won", "userContent", `return (async () => {${currentState.hookAdjustPrompt}})();`) as unknown as (won: Won, userContent: string) => Promise<string>;
      try{
        const result = await hookfn(won, userContent);
        if (typeof result === "string") {
          return result.trim();
        }
      } catch (err) {
        console.error(`hookAdjustPrompt failed in state "${workflowStateKey}":`, err);
      }
      return userContent;
    },
    [currentState, chatId, workflowId, workflowStateKey, updateChatMeta, onStateChange, projectId, folderPath, emit]
  );

  const onSendPrompt = useCallback(async () => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onSendPrompt || !chatId || !workflowId || !workflowStateKey) return;

    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: dataRef.current,
    };
    const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current, projectId, folderPath, emit);
    const hookFn = new Function("won", `return (async () => {${state.onSendPrompt}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onSendPrompt hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, updateChatMeta, onStateChange, projectId, folderPath, emit]);

  const onChatResponse = useCallback(async (response: ChatMessage) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onChatResponse || !chatId || !workflowId || !workflowStateKey) return;

    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: dataRef.current,
    };
    const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current, projectId, folderPath, emit);
    const hookFn = new Function("won", "response", `return (async () => {${state.onChatResponse}})();`) as unknown as (won: Won, response: ChatMessage) => Promise<void>;

    try {
      await hookFn(won, response);
    } catch (err) {
      console.error(`onChatResponse hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, updateChatMeta, onStateChange, projectId, folderPath, emit]);

  const onActionButtonClick = useCallback(async (button: FlowActionButton) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onActionButton || !chatId || !workflowId || !workflowStateKey) return;

    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: dataRef.current,
    };
    const won = buildWon(ctx, updateChatMeta, onStateChange, onEnterForStateRef.current, projectId, folderPath, emit);
    const hookFn = new Function("won", "idx", `return (async () => {${state.onActionButton}})();`) as unknown as (won: Won, idx: number) => Promise<void>;

    try {
      await hookFn(won, button.idx);
    } catch (err) {
      console.error(`onActionButton hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, updateChatMeta, onStateChange, projectId, folderPath, emit]);

  return {
    executeAdjustPrompt,
    onSendPrompt,
    onChatResponse,
    onActionButtonClick,
    currentFlow,
    currentState,
    triggerOnEnterForState: runOnEnterForState,
    advance,
  };
}
