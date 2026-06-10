import { useRef, useCallback, useMemo } from "react";
import { ChatMessage, ChatHistoryEntry, Flow, FlowState, FlowActionButton, Won } from "../types/chat";
import { agentStore } from "../store/agents";
import { generateUniqueFileName, getProjectDataDir } from "../utils/platformUtils";
import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";
import { projectStore } from "../store/projects";
import { projectMetaStore } from "../store/projectMeta";
import { flowStore } from "../store/flows";
import { useEventBus } from "../contexts";
import { loadSettings } from "./useChatSettings";
import { runQuery as runQueryImpl } from "./useLLMQuery";

interface UseChatWorkflowOptions {
  workflowId?: string;
  workflowStateKey?: string;
  flows: Flow[];
  chatId?: string;
  projectId?: string;
}

interface UseChatWorkflowReturn {
  executeAdjustPrompt(userContent: string, modelId?: string): Promise<string>;
  onSendPrompt(): Promise<void>;
  onChatResponse(response: ChatMessage): Promise<void>;
  onActionButtonClick(button: FlowActionButton, logId?: string): Promise<void>;
  currentFlow: Flow | undefined;
  currentState: FlowState | undefined;
  triggerOnEnterForState(stateKey: string, data: Record<string, unknown>): Promise<void>;
  advance(nextStateKey: string): Promise<void>;
}

// logId is assumed to mean that this is running in a subagent/historic version
// Don't pass from main chat thread even if you know it
export function buildWon(
  projectId: string,
  chatId: string,
  logId?: string,
  emit?: (event: string, payload?: unknown) => void,
): Won {
  async function reserveTempFile(baseName?: string): Promise<string> {
    const name = baseName ?? "temp.txt";
    const meta = chatStore.getChat(projectId, chatId);
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
    const folderPath = projectStore.getProjectById(projectId)?.folderPath;
    if (folderPath) {
      folders.push(folderPath);
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
      if(logId) { throw new Error("Cannot advance from sub agent"); }
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowStateKey: nextStateKey,
      });
    },
    reserveTempFile,
    openFile: (uniqueName: string) => {
      if(typeof uniqueName !== "string") { throw new Error("openFile: uniqueName is required"); }
      emit?.("requestOpenFile", { uniqueName });
    },
    getChatHistory(): ChatHistoryEntry[] {
      const logIdToApply = logId ?? chatStore.getLogId(projectId, chatId);
      const messages = chatLogsStore.getLog(projectId, logIdToApply) ?? [];
      return messages.map(m => ({ role: m.role, content: m.content }));
    },
    getChatName(): string {
      const meta = chatStore.getChat(projectId, chatId);
      return meta?.name ?? "";
    },
    async setWorkflowData(partial) {
      const meta = chatStore.getChat(projectId, chatId);
      const merged = { ...(meta?.workflowData ?? {}), ...partial };
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowData: merged,
      });
    },
    get(key) {
      const meta = chatStore.getChat(projectId, chatId);
      return meta?.workflowData?.[key];
    },
    async set(key, value) {
      const meta = chatStore.getChat(projectId, chatId);
      const merged = { ...(meta?.workflowData ?? {}), [key]: value };
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowData: merged,
      });
    },
    async pushMessage(entry: ChatHistoryEntry) {
      if (!entry.role || !["user", "assistant", "system", "tool"].includes(entry.role)) {
        throw new Error(`pushMessage: invalid role "${entry.role}"`);
      }
      if (typeof entry.content !== "string" || entry.content.length === 0) {
        console.error("pushMessage: content must be a non-empty string");
        return;
      }
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: entry.role,
        content: entry.content,
        timestamp: Date.now(),
      };
      const logIdToApply = logId ?? chatStore.getLogId(projectId, chatId);
      await chatStore.appendMessage(projectId, chatId, logIdToApply, chatMessage);
    },
    async createNewVersion() {
      if(logId) { throw new Error("Cannot createNewVersion from sub agent"); }
      await chatStore.createNewVersionLog(projectId, chatId);
    },
    async createChatWithHistory(history, options) {
      const name = (() => {
        if (options?.name) return options.name;
        const currentChat = chatStore.getChat(projectId, chatId);
        const previousName = currentChat?.name ?? "Chat";
        if (previousName.startsWith("⸙ ")) return previousName;
        return `⸙ ${previousName}`;
      })();

      const chatMeta = await chatStore.createChat(
        projectId,
        name,
        options?.workflowId,
        undefined,
      );

      const newChatId = chatMeta.id;
      const newLogId = chatMeta.logId;

      const validRoles = ["user", "assistant", "system", "tool"] as const;
      for (const entry of history) {
        if (!entry.role || !validRoles.includes(entry.role as typeof validRoles[number])) {
          throw new Error(`createChatWithHistory: invalid role "${entry.role}"`);
        }
        if (typeof entry.content !== "string" || entry.content.length === 0) {
          throw new Error(`createChatWithHistory: content must be a non-empty string`);
        }
        const chatMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: entry.role,
          content: entry.content,
          timestamp: Date.now(),
        };
        await chatStore.appendMessage(projectId, newChatId, newLogId, chatMessage);
      }

      if (options?.initialPrompt) {
        chatMeta.draft = options.initialPrompt;
        await chatStore.updateChatMeta(projectId, newChatId, {
          draft: options.initialPrompt,
          updatedAt: Date.now(),
        });
      }

      if (options?.workflowId) {
        const allFlows = flowStore.getFlows();
        const flow = allFlows.find((f) => f.id === options.workflowId);
        if (flow?.initialState) {
          await chatStore.updateChatMeta(projectId, newChatId, {
            workflowStateKey: flow.initialState,
            updatedAt: Date.now(),
          });
        }
      }

      emit?.("navigateToChat", { chatId: newChatId });

      return chatMeta;
    },
    async runQuery(messages: string | ChatHistoryEntry[], options) {
      const messageArr: ChatHistoryEntry[] = (typeof messages === 'string') 
        ? [{ content: messages, role: 'user' }]
        : messages;
      const settings = loadSettings();
      const chat = chatStore.getChat(projectId, chatId);
      const projectMeta = projectMetaStore.getProjectMeta(projectId);
      const allAgents = agentStore.getAllAgents();
      const agentId = chat?.activeAgentId;
      const agent = agentId ? allAgents.find((a) => a.id === agentId) : undefined;
      const resolvedSystemPrompt = options?.systemPrompt || agent?.systemPrompt || projectMeta?.systemPrompt || settings.systemPrompt;
      const resolvedModel = options?.model || projectMeta?.defaultModel || settings.defaultModel || "";
      const chatMessages: ChatMessage[] = messageArr.map((m) => ({
        id: crypto.randomUUID(),
        role: m.role,
        content: m.content,
        timestamp: Date.now(),
      }));
      const result = await runQueryImpl(chatMessages, {
        settings,
        projectId,
        chatId,
        systemPrompt: resolvedSystemPrompt,
        model: resolvedModel,
      });
      return result.finalMessage.content;
    },
  };
}

export async function executeCommand(
  command: string,
  flowId: string,
  chatId: string | undefined,
  projectId?: string,
  emit?: (event: string, payload?: unknown) => void,
): Promise<void> {
  if (!chatId || !projectId) return;
  const won = buildWon(projectId, chatId, undefined, emit);
  const hookFn = new Function("won", `return (async () => {${command}})();`) as unknown as (won: Won) => Promise<void>;
  try {
    await hookFn(won);
  } catch (err) {
    console.error(`command "${flowId}" failed:`, err);
  }
}

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const { workflowId, workflowStateKey, flows, chatId, projectId } = options;
  const { emit } = useEventBus();

  const currentFlow = useMemo(() => flows.find((f) => f.id === workflowId), [flows, workflowId]);
  const currentState = useMemo(
    () => currentFlow?.states?.[workflowStateKey ?? ""],
    [currentFlow, workflowStateKey]
  );

  const runOnEnterForState = useCallback(async (stateKey: string) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[stateKey];
    if (!state?.onEnter || !chatId || !workflowId || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, emit);
    const hookFn = new Function("won", `return (async () => {${state.onEnter}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onEnter hook failed in state "${stateKey}":`, err);
    }
  }, [flows, workflowId, chatId, projectId, emit]);

  const advance = useCallback(async (nextStateKey: string) => {
    await runOnEnterForState(nextStateKey);
  }, [runOnEnterForState]);

  const onEnterForStateRef = useRef(runOnEnterForState);
  onEnterForStateRef.current = runOnEnterForState;

  const executeAdjustPrompt = useCallback(
    async (userContent: string): Promise<string> => {
      if (!currentState?.hookAdjustPrompt || !chatId || !workflowId || !workflowStateKey || !projectId) {
        return userContent;
      }

      const won = buildWon(projectId, chatId, undefined, emit);

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
    [currentState, chatId, workflowId, workflowStateKey, projectId, emit]
  );

  const onSendPrompt = useCallback(async () => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onSendPrompt || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, emit);
    const hookFn = new Function("won", `return (async () => {${state.onSendPrompt}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      console.error(`onSendPrompt hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, emit]);

  const onChatResponse = useCallback(async (response: ChatMessage) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onChatResponse || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, emit);
    const hookFn = new Function("won", "response", `return (async () => {${state.onChatResponse}})();`) as unknown as (won: Won, response: ChatMessage) => Promise<void>;

    try {
      await hookFn(won, response);
    } catch (err) {
      console.error(`onChatResponse hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, emit]);

  const onActionButtonClick = useCallback(async (button: FlowActionButton, logId?: string) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onActionButton || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, logId, emit);
    const hookFn = new Function("won", "idx", `return (async () => {${state.onActionButton}})();`) as unknown as (won: Won, idx: number) => Promise<void>;

    try {
      await hookFn(won, button.idx);
    } catch (err) {
      console.error(`onActionButton hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId, emit]);

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
