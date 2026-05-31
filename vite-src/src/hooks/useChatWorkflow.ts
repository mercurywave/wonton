import { useRef, useCallback, useMemo } from "react";
import { ChatMessage, ChatHistoryEntry, Flow, FlowState, FlowActionButton, Won, WorkflowStateContext } from "../types/chat";
import { generateUniqueFileName, getProjectDataDir } from "../utils/neuUtils";
import { useEventBus } from "../contexts";
import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";

interface UseChatWorkflowOptions {
  workflowId?: string;
  workflowStateKey?: string;
  flows: Flow[];
  chatId?: string;
  modelId?: string;
  projectId?: string;
  folderPath?: string;
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

export function buildWon(
  projectId: string,
  chatId: string,
  logId: string,
  ctx: WorkflowStateContext,
  emit?: (event: string, payload?: unknown) => void,
): Won {
  async function reserveTempFile(baseName?: string): Promise<string> {
    const name = baseName ?? "temp.txt";
    const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
    const existing = (meta?.reservedTempFiles) ?? [];

    const nextBase = (() => {
      const matching = existing.filter((r) => r.baseName === name);
      if (matching.length === 0) return name;
      const nextIndex = matching.length + 1;
      return `${name} (${nextIndex})`;
    })();

    const folders: string[] = [];
    const dataDir = await getProjectDataDir(projectId);
    if (dataDir) {
      folders.push(`${dataDir}/tmp`);
    }
    if (ctx.folderPath) {
      folders.push(ctx.folderPath);
    }

    const uniqueName = await generateUniqueFileName(name, folders);

    const updated = [...existing, { baseName: nextBase, uniqueName }];
    await chatStore.updateChatMeta(projectId, chatId, {
      reservedTempFiles: updated,
      updatedAt: Date.now(),
    });

    return uniqueName;
  }

  return {
    async advance(nextStateKey: string) {
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowStateKey: nextStateKey,
      });
    },
    async setWorkflowData(partial) {
      const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
      const merged = { ...(meta?.workflowData ?? {}), ...partial };
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowData: merged,
      });
    },
    get(key) {
      return ctx.workflowData[key];
    },
    async set(key, value) {
      const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
      const merged = { ...(meta?.workflowData ?? {}), [key]: value };
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowData: merged,
      });
    },
    reserveTempFile,
    openFile: (uniqueName: string) => {
      emit?.("requestOpenFile", { uniqueName });
    },
    getChatHistory(): ChatHistoryEntry[] {
      const messages = chatLogsStore.getLog(projectId, logId) ?? [];
      return messages.map(m => ({ role: m.role, content: m.content }));
    },
    async pushMessage(entry: ChatHistoryEntry) {
      if (!entry.role || !["user", "assistant", "system", "tool"].includes(entry.role)) {
        throw new Error(`pushMessage: invalid role "${entry.role}"`);
      }
      if (typeof entry.content !== "string" || entry.content.length === 0) {
        throw new Error("pushMessage: content must be a non-empty string");
      }
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: entry.role,
        content: entry.content,
        timestamp: Date.now(),
      };
      await chatLogsStore.appendMessage(projectId, logId, chatMessage);
    },
    async createNewVersion() {
      await chatStore.createNewVersionLog(projectId, chatId);
    },
  };
}

export async function executeCommand(
  command: string,
  flowId: string,
  chatId: string | undefined,
  projectId?: string,
  folderPath?: string,
  emit?: (event: string, payload?: unknown) => void,
): Promise<void> {
  if (!chatId || !projectId) return;
  const logId = chatStore.getLogId(projectId, chatId);
  const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
  const stateRef: WorkflowStateContext = {
    chatId,
    workflowId: flowId,
    stateKey: "command",
    workflowData: meta?.workflowData ?? {},
    folderPath,
  };
  const won = buildWon(projectId, chatId, logId, stateRef, emit);
  const hookFn = new Function("won", `return (async () => {${command}})();`) as unknown as (won: Won) => Promise<void>;
  try {
    await hookFn(won);
  } catch (err) {
    console.error(`command "${flowId}" failed:`, err);
  }
}

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const { workflowId, workflowStateKey, flows, chatId, modelId, projectId, folderPath } = options;
  const { emit } = useEventBus();

  const currentFlow = useMemo(() => flows.find((f) => f.id === workflowId), [flows, workflowId]);
  const currentState = useMemo(
    () => currentFlow?.states?.[workflowStateKey ?? ""],
    [currentFlow, workflowStateKey]
  );

  const runOnEnterForState = useCallback(async (stateKey: string, data: Record<string, unknown>) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[stateKey];
    if (!state?.onEnter || !chatId || !workflowId || !projectId) return;

    const logId = chatStore.getLogId(projectId, chatId);
    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey,
      workflowData: data,
      folderPath,
    };
    const won = buildWon(projectId, chatId, logId, ctx, emit);
    const hookFn = new Function("won", `return (async () => {${state.onEnter}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onEnter hook failed in state "${stateKey}":`, err);
    }
  }, [flows, workflowId, chatId, projectId, folderPath, emit]);

  const advance = useCallback(async (nextStateKey: string) => {
    const meta = projectId && chatId ? chatStore.getChatMetas(projectId).find((m) => m.id === chatId) : undefined;
    const data = meta?.workflowData ?? {};
    await runOnEnterForState(nextStateKey, data);
  }, [runOnEnterForState, projectId, chatId]);

  const onEnterForStateRef = useRef(runOnEnterForState);
  onEnterForStateRef.current = runOnEnterForState;

  const executeAdjustPrompt = useCallback(
    async (userContent: string, promptModelId?: string): Promise<string> => {
      if (!currentState?.hookAdjustPrompt || !chatId || !workflowId || !workflowStateKey || !projectId) {
        return userContent;
      }

      const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
      const ctx: WorkflowStateContext = {
        chatId,
        workflowId,
        stateKey: workflowStateKey,
        workflowData: meta?.workflowData ?? {},
        modelId: promptModelId ?? modelId,
        folderPath,
      };
      const logId = chatStore.getLogId(projectId, chatId);
      const won = buildWon(projectId, chatId, logId, ctx, emit);

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
    [currentState, chatId, workflowId, workflowStateKey, projectId, modelId, folderPath, emit]
  );

  const onSendPrompt = useCallback(async () => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onSendPrompt || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: meta?.workflowData ?? {},
      folderPath,
    };
    const logId = chatStore.getLogId(projectId, chatId);
    const won = buildWon(projectId, chatId, logId, ctx, emit);
    const hookFn = new Function("won", `return (async () => {${state.onSendPrompt}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onSendPrompt hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, folderPath, emit]);

  const onChatResponse = useCallback(async (response: ChatMessage) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onChatResponse || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: meta?.workflowData ?? {},
      folderPath,
    };
    const logId = chatStore.getLogId(projectId, chatId);
    const won = buildWon(projectId, chatId, logId, ctx, emit);
    const hookFn = new Function("won", "response", `return (async () => {${state.onChatResponse}})();`) as unknown as (won: Won, response: ChatMessage) => Promise<void>;

    try {
      await hookFn(won, response);
    } catch (err) {
      console.error(`onChatResponse hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, folderPath, emit]);

  const onActionButtonClick = useCallback(async (button: FlowActionButton) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onActionButton || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const meta = chatStore.getChatMetas(projectId).find((m) => m.id === chatId);
    const ctx: WorkflowStateContext = {
      chatId,
      workflowId,
      stateKey: workflowStateKey,
      workflowData: meta?.workflowData ?? {},
      folderPath,
    };
    const logId = chatStore.getLogId(projectId, chatId);
    const won = buildWon(projectId, chatId, logId, ctx, emit);
    const hookFn = new Function("won", "idx", `return (async () => {${state.onActionButton}})();`) as unknown as (won: Won, idx: number) => Promise<void>;

    try {
      await hookFn(won, button.idx);
    } catch (err) {
      console.error(`onActionButton hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, folderPath, emit]);

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
