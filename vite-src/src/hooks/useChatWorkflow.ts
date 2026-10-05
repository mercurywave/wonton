import { useRef, useCallback, useMemo } from "react";
import { ChatMessage, ChatHistoryEntry, Flow, FlowState, FlowActionButton, Won, SubagentMeta, SubagentOptions, ReasoningEffort, FlowCustomTool } from "../types/chat";
import { FeedbackPayload, addToast } from "../contexts";
import { agentStore } from "../store/agents";
import { resolveTempFilePath } from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";
import { sanitizeAndResolvePath } from "../tools/pathTools";
import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";
import { projectStore } from "../store/projects";
import { projectMetaStore } from "../store/projectMeta";
import { flowStore } from "../store/flows";
import { toolStore } from "../store/tools";
import { emit } from "../contexts";
import { loadAndResolveSettings } from "./useChatSettings";
import { runQuery as runQueryImpl } from "./useLLMQuery";
import { runToolCallLoop } from "./useChatApi";
import { filterToAvailableTools } from "../tools";
import { getAgentByName, resolveAgentFolderPath } from "../utils/agents";
import { reserveTempFile as reserveTempFileUtil, writeTempFile } from "../utils/tempFiles";
import { getAllToolNames } from "../tools";

// Threshold: if output exceeds this, write to temp file instead of inline
const LARGE_OUTPUT_THRESHOLD = 4096; // 4KB

function getToolSetFromPermissions(agent: import("../types/chat").Agent | undefined): string[] {
  if (!agent?.toolPermissions) return [];
  if (agent.toolPermissions.mode === "include") {
    return agent.toolPermissions.tools;
  }
  if (agent.toolPermissions.mode === "exclude") {
    const allTools = getAllToolNames();
    return allTools.filter(name => !agent.toolPermissions!.tools.includes(name));
  }
  return [];
}

interface UseChatWorkflowOptions {
  workflowId?: string;
  workflowStateKey?: string;
  flows: Flow[];
  chatId?: string;
  projectId?: string;
  showFeedback?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>;
}

interface UseChatWorkflowReturn {
  executeAdjustPrompt(userContent: string): Promise<string>;
  onSendPrompt(): Promise<void>;
  onChatResponse(response: ChatMessage): Promise<void>;
  onActionButtonClick(button: FlowActionButton, logId?: string): Promise<void>;
  currentFlow: Flow | undefined;
  currentState: FlowState | undefined;
  triggerOnEnterForState(stateKey: string, data: Record<string, unknown>): Promise<void>;
  advance(nextStateKey: string): Promise<void>;
}

interface SubmitChatPromptOptions {
  projectId: string;
  chatId: string;
  prompt: string;
  showFeedback?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>;
  submit: (prompt: string, originalPrompt: string) => Promise<ChatMessage | undefined>;
}

async function runWorkflowPromptHook(
  won: Won,
  projectId: string,
  chatId: string,
  hookName: "hookAdjustPrompt" | "hookInterceptPrompt" | "onSendPrompt" | "onChatResponse",
  prompt: string,
  response?: ChatMessage,
): Promise<string | undefined> {
  const meta = chatStore.getChat(projectId, chatId);
  const flow = flowStore.getFlows().find((candidate) => candidate.id === meta?.workflowId);
  const state = flow?.states?.[meta?.workflowStateKey ?? ""];
  const hook = state?.[hookName];
  if (!hook) return undefined;

  const hookFn = new Function(
    "won",
    "userContent",
    "response",
    `return (async () => {${hook}})();`,
  ) as unknown as (won: Won, userContent: string, response?: ChatMessage) => Promise<string | undefined>;

  try {
    return await hookFn(won, prompt, response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    addToast(`${hookName} hook failed: ${message}`, "error");
    console.error(`${hookName} hook failed:`, err);
    return undefined;
  }
}

export async function submitChatPrompt({
  projectId,
  chatId,
  prompt,
  showFeedback,
  submit,
}: SubmitChatPromptOptions): Promise<void> {
  const originalPrompt = prompt.trim().split("\n").map((line) => line.trim()).join("\n");
  if (!originalPrompt) return;

  const won = buildWon(projectId, chatId, undefined, showFeedback);
  const adjustedPrompt = await runWorkflowPromptHook(won, projectId, chatId, "hookAdjustPrompt", originalPrompt);
  const processedPrompt = typeof adjustedPrompt === "string" ? adjustedPrompt.trim() : originalPrompt;
  if (!processedPrompt) return;

  const meta = chatStore.getChat(projectId, chatId);
  const flow = flowStore.getFlows().find((candidate) => candidate.id === meta?.workflowId);
  const state = flow?.states?.[meta?.workflowStateKey ?? ""];
  const intercepted = Boolean(state?.hookInterceptPrompt);
  if (intercepted) {
    await won.pushMessage({ role: 'user', content: processedPrompt });
    await runWorkflowPromptHook(won, projectId, chatId, "hookInterceptPrompt", processedPrompt);
  }
  else{
    await runWorkflowPromptHook(won, projectId, chatId, "onSendPrompt", processedPrompt);
    const response = intercepted ? undefined : await submit(processedPrompt, originalPrompt);
    await runWorkflowPromptHook(won, projectId, chatId, "onChatResponse", processedPrompt, response);
  }
}

// logId is assumed to mean that this is running in a subagent/historic version
// Don't pass from main chat thread even if you know it
export function buildWon(
  projectId: string,
  chatId: string,
  logId: string | undefined,
  showFeedback?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>,
): Won {
  async function reserveTempFile(baseName?: string): Promise<string> {
    return reserveTempFileUtil(projectId, chatId, baseName);
  }

  async function readFile(path: string): Promise<string> {
    if (!path || typeof path !== "string" || path.trim().length === 0) {
      throw new Error("readFile: path is required");
    }

    const folderPath = projectStore.getProjectById(projectId)?.folderPath;
    if (!folderPath) {
      throw new Error("readFile: No folder linked to this project");
    }

    const reservedTempFiles = await chatStore.getReservedTempFiles(projectId, chatId);
    const tempResult = await resolveTempFilePath(path, projectId, reservedTempFiles);

    let fullPath: string;
    let responsePath: string;
    if (tempResult.redirected) {
      fullPath = tempResult.tmpPath;
      responsePath = tempResult.virtualPath;
    } else {
      const sanitized = await sanitizeAndResolvePath(folderPath, path);
      if (!sanitized.success) {
        throw new Error(`readFile: ${sanitized.error}`);
      }
      fullPath = sanitized.resolvedPath!;
      responsePath = sanitized.relativePath!;
    }

    const stat = await filesystem.getStats(fullPath);
    if (!stat) {
      throw new Error(`readFile: File not found: ${responsePath}`);
    }

    if (stat.isDirectory) {
      throw new Error(`readFile: Path is a directory, not a file: ${responsePath}`);
    }

    const content = await filesystem.readFile(fullPath);
    if (content === undefined || content === null) {
      throw new Error(`readFile: Could not read file: ${responsePath}`);
    }

    return content;
  }

  return {
    async advance(nextStateKey: string) {
      if(logId) { throw new Error("Cannot advance from sub agent"); }
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowStateKey: nextStateKey,
      });
    },
    reserveTempFile,
    readFile,
    openFile: (uniqueName: string) => {
      if(typeof uniqueName !== "string") { throw new Error("openFile: uniqueName is required"); }
      emit("requestOpenFile", { uniqueName });
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
    async setChatName(name: string) {
      await chatStore.updateChatMeta(projectId, chatId, { name });
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

      emit("navigateToChat", { chatId: newChatId });

      return chatMeta;
    },
    async runQuery(messages: string | ChatHistoryEntry[], options) {
      const messageArr: ChatHistoryEntry[] = (typeof messages === 'string') 
        ? [{ content: messages.trim(), role: 'user' }]
        : messages;
      const settings = loadAndResolveSettings();
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
      return result.finalMessage.content ?? "";
    },
    getChatDraft(): string {
      const meta = chatStore.getChat(projectId, chatId);
      return meta?.draft ?? "";
    },
    async setChatDraft(draft: string) {
      await chatStore.setChatDraft(projectId, chatId, draft);
    },
    async runCommand(command: string): Promise<string> {
      const { stdout, stderr, code } = await this.runCommandDetails(command);

      const tempFileIds: string[] = [];
      let stdoutContent = stdout;
      let stderrContent = stderr;

      if (stdout.length > LARGE_OUTPUT_THRESHOLD) {
        const stdoutTempFile = await reserveTempFileUtil(projectId, chatId, "stdout.txt");
        tempFileIds.push(stdoutTempFile);
        await writeTempFile(projectId, stdoutTempFile, stdout);
        stdoutContent = `[Output truncated, written to temp file: ${stdoutTempFile}]`;
      }

      if (stderr.length > LARGE_OUTPUT_THRESHOLD) {
        const stderrTempFile = await reserveTempFileUtil(projectId, chatId, "stderr.txt");
        tempFileIds.push(stderrTempFile);
        await writeTempFile(projectId, stderrTempFile, stderr);
        stderrContent = `[Output truncated, written to temp file: ${stderrTempFile}]`;
      }

      let output = `Exit code: ${code}\n\n`;
      if (tempFileIds.length > 0) {
        output += `STDOUT:\n${stdoutContent}\n\nSTDERR:\n${stderrContent}\n\n`
          + `Note: Large output was written to temp files. Read them using the temp file selector.`;
      } else {
        output += `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}`;
      }
      return output;
    },
    async runCommandDetails(command: string): Promise<{ stdout: string; stderr: string; code: number | null }> {
      const folderPath = projectStore.getProjectById(projectId)?.folderPath;
      const result = await window.electronAPI.os.execCommand(command, folderPath);
      return { stdout: result.stdout, stderr: result.stderr, code: result.status };
    },
    async alert(message: string) {
      if (!showFeedback) {
        console.warn("alert() called but feedback not available");
        return;
      }
      const logIdToUse = logId ?? chatStore.getLogId(projectId, chatId);
      await showFeedback(projectId, chatId, logIdToUse, { type: "alert", message });
    },
    async select(question: string, choices: string[]) {
      if (!showFeedback) {
        console.warn("select() called but feedback not available");
        return -1;
      }
      const logIdToUse = logId ?? chatStore.getLogId(projectId, chatId);
      const result = await showFeedback(projectId, chatId, logIdToUse, { type: "select", question, choices });
      return typeof result === "number" ? result : -1;
    },
    async prompt(question: string, options) {
      if (!showFeedback) {
        console.warn("prompt() called but feedback not available");
        return undefined;
      }
      const logIdToUse = logId ?? chatStore.getLogId(projectId, chatId);
      const result = await showFeedback(projectId, chatId, logIdToUse, { type: "text", question, placeholder: options?.placeholder });
      return typeof result === "string" ? result : undefined;
    },
    setStatus: (message?: string) => {
      emit("setExtensionStatus", message);
    },
    createSubagent: async (options?: SubagentOptions): Promise<string> => {
      await agentStore.load();
      const allAgents = agentStore.getAllAgents();
      
      const agentName = options?.agent || allAgents[0]?.name;
      const agent = agentName ? getAgentByName(allAgents, agentName) : allAgents[0];
      
      if (!agent) {
        throw new Error("No agents available for subagent");
      }
      
      // Create subagent log
      const subagentLogId = crypto.randomUUID();
      await chatLogsStore.reserveLog(projectId, subagentLogId);
      
      // Create and save subagent meta
      const subagentId = crypto.randomUUID();
      const thinkingValue = options?.thinking === true ? "medium" : options?.thinking === false ? "none" : (options?.thinking as ReasoningEffort | undefined);
      const subagentMeta: SubagentMeta = {
        id: subagentId,
        agentId: agent.id,
        toolSet: getToolSetFromPermissions(agent),
        query: "",
        status: "running",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        logId: subagentLogId,
        model: options?.model,
        thinking: thinkingValue,
      };
      await chatStore.saveSubagentMeta(projectId, chatId, subagentMeta);
      
      return subagentLogId;
    },
    runAgent: async (logId: string, userMessage: string): Promise<string> => {
      // Load settings
      const settings = loadAndResolveSettings();
      
      // Find the subagent meta to get agent info
      const meta = chatStore.getChat(projectId, chatId);
      const subagentMeta = meta?.subagents?.find((s) => s.logId === logId);
      
      if (!subagentMeta) {
        throw new Error(`Subagent with logId "${logId}" not found`);
      }
      
      // Load agents and resolve the agent
      await agentStore.load();
      const allAgents = agentStore.getAllAgents();
      const agent = allAgents.find((a) => a.id === subagentMeta.agentId);
      
      if (!agent) {
        throw new Error(`Agent "${subagentMeta.agentId}" not found`);
      }
      
      // Resolve folder path
      const folderPath = await resolveAgentFolderPath(agent, projectStore.getProjectById(projectId)?.folderPath, projectId);
      
      // Build user message
      const chatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage.trim(),
        timestamp: Date.now(),
      };
      
      // Resolve model and thinking from subagent meta, falling back to settings
      const model = subagentMeta.model || settings.defaultModel || "";
      const reasoningEffort = (subagentMeta.thinking as ReasoningEffort | undefined) || "none";
      
      // Run the subagent tool-call loop
      const result = await runToolCallLoop({
        settings,
        systemPrompt: agent.systemPrompt,
        model,
        toolNames: subagentMeta.toolSet || [],
        folderPath,
        initialMessages: [chatMessage],
        signal: undefined,
        projectId,
        chatId,
        logId,
        isSubagent: true,
        agentId: agent.id,
        agent,
        allAgents,
        reasoningEffort,
        onChatUpdated: () => {},
        onValidate: showFeedback,
      });
      
      // Update subagent meta to completed
      subagentMeta.status = "completed";
      subagentMeta.updatedAt = Date.now();
      await chatStore.saveSubagentMeta(projectId, chatId, subagentMeta);
      
      return result.finalMessage.content ?? "";
    },
    async runPrompt(userMessage: string): Promise<string> {
      if (logId) { throw new Error("Cannot runPrompt from sub agent"); }
      const settings = loadAndResolveSettings();
      const chat = chatStore.getChat(projectId, chatId);
      const projectMeta = projectMetaStore.getProjectMeta(projectId);
      await agentStore.load();
      const allAgents = agentStore.getAllAgents();
      const resolvedAgentId = chat?.activeAgentId || "builtin:default";
      const agent = allAgents.find((a) => a.id === resolvedAgentId);
      const mainLogId = chatStore.getLogId(projectId, chatId) ?? "";
      await chatLogsStore.load(projectId, mainLogId);
      const chatMessages = chatLogsStore.getLog(projectId, mainLogId) || [];
      const systemPrompt = agent?.systemPrompt || projectMeta?.systemPrompt || settings.systemPrompt;
      const model = chat?.activeModel || projectMeta?.defaultModel || settings.defaultModel || "";
      const reasoningEffort = (chat?.reasoningEffort as ReasoningEffort | undefined) || settings.reasoningEffort;
      const folderPath = projectStore.getProjectById(projectId)?.folderPath;
      const enabledToolNames = chat?.enabledToolNames ?? [];
      const agentToolSet = agent ? getToolSetFromPermissions(agent) : [];
      const toolNames = [...new Set([...agentToolSet, ...enabledToolNames])];
      const userChatMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: userMessage.trim().split("\n").map(t => t.trim()).join("\n"),
        timestamp: Date.now(),
      };
      const resolvedTools = await filterToAvailableTools(
        toolNames,
        folderPath,
        agent,
        allAgents,
        enabledToolNames,
      );
      const customToolDefs = (() => {
        const toolMap = new Map<string, FlowCustomTool>();
        const projectTools = toolStore.getTools();
        for (const t of projectTools) {
          toolMap.set(t.name, { name: t.name, description: t.description, code: t.code });
        }
        if (!chat?.workflowId) {
          return Array.from(toolMap.values());
        }
        const allFlows = flowStore.getFlows();
        const flow = allFlows.find((f) => f.id === chat.workflowId);
        if (flow?.tools) {
          for (const t of flow.tools) {
            toolMap.set(t.name, { name: t.name, description: t.description, code: t.code });
          }
        }
        return Array.from(toolMap.values());
      })();
      const result = await runToolCallLoop({
        settings,
        systemPrompt,
        model,
        toolNames: resolvedTools.map(t => t.function.name),
        folderPath,
        initialMessages: [...chatMessages, userChatMessage],
        signal: undefined,
        projectId,
        chatId,
        logId: mainLogId,
        isSubagent: false,
        agentId: resolvedAgentId,
        agent,
        allAgents,
        reasoningEffort,
        customTools: customToolDefs.length > 0 ? customToolDefs : undefined,
        enabledToolNames,
        onChatUpdated: () => {},
        onValidate: showFeedback,
      });
      return result.finalMessage.content ?? "";
    },
    async finishWorkflow() {
      await chatStore.updateChatMeta(projectId, chatId, {
        workflowId: undefined,
        workflowStateKey: undefined,
        workflowData: undefined,
        updatedAt: Date.now(),
      });
    },
    toast(message: string, severity?: "info" | "success" | "warning" | "error") {
      addToast(message, severity);
    },
    async submitPrompt(prompt: string) {
      if (!chatId || !projectId) {
        throw new Error("Cannot submitPrompt: no active chat or project");
      }
      if (logId) { throw new Error("Cannot submitPrompt from sub agent"); }

      await submitChatPrompt({
        projectId,
        chatId,
        prompt,
        showFeedback,
        submit: async (processedPrompt) => {
          await buildWon(projectId, chatId, undefined, showFeedback).runPrompt(processedPrompt);
          const mainLogId = chatStore.getLogId(projectId, chatId);
          return mainLogId
            ? [...(chatLogsStore.getLog(projectId, mainLogId) ?? [])].reverse().find((message) => message.role === "assistant")
            : undefined;
        },
      });
    },
  };
}

export async function executeCommand(
  command: string,
  flowId: string,
  chatId: string | undefined,
  projectId?: string,
  showFeedback?: (projectId: string, chatId: string, logId: string, payload: FeedbackPayload) => Promise<number | string | void>,
): Promise<void> {
  if (!chatId || !projectId) return;
  const won = buildWon(projectId, chatId, undefined, showFeedback);
  const hookFn = new Function("won", `return (async () => {${command}})();`) as unknown as (won: Won) => Promise<void>;
 try {
      await hookFn(won);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`Command "${flowId}" failed: ${msg}`, "error");
      console.error(`command "${flowId}" failed:`, err);
    }
}

export function useChatWorkflow(options: UseChatWorkflowOptions): UseChatWorkflowReturn {
  const { workflowId, workflowStateKey, flows, chatId, projectId, showFeedback } = options;

  const currentFlow = useMemo(() => flows.find((f) => f.id === workflowId), [flows, workflowId]);
  const currentState = useMemo(
    () => currentFlow?.states?.[workflowStateKey ?? ""],
    [currentFlow, workflowStateKey]
  );

  const runOnEnterForState = useCallback(async (stateKey: string) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[stateKey];
    if (!state?.onEnter || !chatId || !workflowId || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, showFeedback);
    const hookFn = new Function("won", `return (async () => {${state.onEnter}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`onEnter hook failed in state "${stateKey}": ${msg}`, "error");
      console.error(`onEnter hook failed in state "${stateKey}":`, err);
    }
  }, [flows, workflowId, chatId, projectId]);

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

      const won = buildWon(projectId, chatId, undefined, showFeedback);

      const hookfn = new Function("won", "userContent", `return (async () => {${currentState.hookAdjustPrompt}})();`) as unknown as (won: Won, userContent: string) => Promise<string>;
      try{
        const result = await hookfn(won, userContent);
        if (typeof result === "string") {
          return result.trim();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        addToast(`hookAdjustPrompt failed in state "${workflowStateKey}": ${msg}`, "error");
        console.error(`hookAdjustPrompt failed in state "${workflowStateKey}":`, err);
      }
      return userContent;
    },
    [currentState, chatId, workflowId, workflowStateKey, projectId]
  );

  const onSendPrompt = useCallback(async () => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onSendPrompt || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, showFeedback);
    const hookFn = new Function("won", `return (async () => {${state.onSendPrompt}})();`) as unknown as (won: Won) => Promise<void>;

    try {
      await hookFn(won);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`onSendPrompt hook failed in state "${workflowStateKey}": ${msg}`, "error");
      console.error(`onSendPrompt hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId]);

  const onChatResponse = useCallback(async (response: ChatMessage) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onChatResponse || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, undefined, showFeedback);
    const hookFn = new Function("won", "response", `return (async () => {${state.onChatResponse}})();`) as unknown as (won: Won, response: ChatMessage) => Promise<void>;

 try {
      await hookFn(won, response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`onChatResponse hook failed in state "${workflowStateKey}": ${msg}`, "error");
      console.error(`onChatResponse hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId]);

  const onActionButtonClick = useCallback(async (button: FlowActionButton, logId?: string) => {
    const flow = flows.find((f) => f.id === workflowId);
    const state = flow?.states?.[workflowStateKey ?? ""];
    if (!state?.onActionButton || !chatId || !workflowId || !workflowStateKey || !projectId) return;

    const won = buildWon(projectId, chatId, logId, showFeedback);
    const hookFn = new Function("won", "idx", `return (async () => {${state.onActionButton}})();`) as unknown as (won: Won, idx: number) => Promise<void>;

    try {
      await hookFn(won, button.idx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addToast(`onActionButton hook failed in state "${workflowStateKey}": ${msg}`, "error");
      console.error(`onActionButton hook failed in state "${workflowStateKey}":`, err);
    }
  }, [flows, workflowId, chatId, workflowStateKey, projectId]);

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
