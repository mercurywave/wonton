import { ToolHandler, ToolContext, ToolDefinition } from "./handler";
import { ToolResult, ChatMessage, ToolCall } from "../types/chat";
import { runToolCallLoop } from "../hooks/useChatApi";
import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";
import { getAgentByName } from "../utils/agents";
import { getAllAgents, loadAgentsFile } from "../hooks/useAgents";
import { SubagentMeta } from "../types/chat";

export const EXECUTE_SUBAGENT_TOOL_NAME = "message";

export class ExecuteSubagentHandler implements ToolHandler {
  private static instance: ExecuteSubagentHandler;

  readonly name = EXECUTE_SUBAGENT_TOOL_NAME;

  readonly definition: ToolDefinition = {
    type: "function",
    function: {
      name: EXECUTE_SUBAGENT_TOOL_NAME,
      description:
        "Send a message to an agent to perform a complex focused task. Agents available: [\"subagent\"]",
      parameters: {
        type: "object",
        properties: {
          agentName: {
            type: "string",
            description: "The ID of the agent to use for this subagent task",
          },
          query: {
            type: "string",
            description: "The specific task or question to give to the subagent",
          },
        },
        required: ["agentName", "query"],
      },
    },
  };

  private constructor() {}

  static getInstance(): ExecuteSubagentHandler {
    if (!ExecuteSubagentHandler.instance) {
      ExecuteSubagentHandler.instance = new ExecuteSubagentHandler();
    }
    return ExecuteSubagentHandler.instance;
  }

  async execute(args: object, context: ToolContext, toolCall: ToolCall): Promise<ToolResult> {
    const { agentName, query } = args as { agentName: string; query: string };
    const { folderPath, projectId, chatId, settings, onChatUpdated } = context;

    if (!agentName || !query) {
      return {
        callId: "",
        content: "Error: agentName and query are required",
        isError: true,
      };
    }

    if (!projectId || !chatId || !settings) {
      return {
        callId: "",
        content: "Error: No project/chat/settings linked to this invocation",
        isError: true,
      };
    }

    if (!folderPath) {
      return {
        callId: "",
        content: "Error: No folder linked to this project",
        isError: true,
      };
    }

    // Load agents and resolve the requested agent
    const customAgents = await loadAgentsFile();
    const allAgents = getAllAgents(customAgents);
    const agent = getAgentByName(allAgents, agentName);

    if (!agent) {
      return {
        callId: "",
        content: `Error: Agent "${agentName}" not found`,
        isError: true,
      };
    }
    
    // Create subagent log
    const agentId = agent.id;
    const subagentId = crypto.randomUUID();
    const subagentLogId = toolCall.logId ?? crypto.randomUUID();
    await chatLogsStore.reserveLog(projectId, subagentLogId);

    // Create subagent meta
    const subagentMeta: SubagentMeta = {
      id: subagentId,
      agentId,
      toolSet: agent.defaultToolSet || [],
      query,
      status: "running",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      logId: subagentLogId,
    };

    await chatStore.saveSubagentMeta(projectId, chatId, subagentMeta);
    onChatUpdated?.();

    // Build the user message for the subagent
    const subagentUserMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: query,
      timestamp: Date.now(),
    };

    // Resolve model for subagent
    const subagentModel = settings.defaultModel || agentId;

    // Run the subagent tool-call loop
    const result = await runToolCallLoop({
      settings,
      systemPrompt: agent.systemPrompt,
      model: subagentModel,
      toolNames: agent.defaultToolSet || [],
      folderPath,
      initialMessages: [subagentUserMessage],
      signal: undefined,
      projectId,
      chatId: chatId,
      logId: subagentLogId,
      isSubagent: true,
      onUpdateMessage: () => {
        // No UI update needed for subagent — it's a background tool call
      },
      onChatUpdated,
    });

    // Update subagent meta to completed
    subagentMeta.status = "completed";
    subagentMeta.updatedAt = Date.now();
    await chatStore.saveSubagentMeta(projectId, chatId, subagentMeta);
    onChatUpdated?.();

    // Format the result
    const resultContent = JSON.stringify({
      subagentId,
      agentName: agent.name,
      query,
      response: result.finalMessage.content,
      toolCalls: result.finalMessage.toolCalls?.length || 0,
      tokens: result.finalMessage.stats?.totalTokens || 0,
      logId: subagentLogId,
    });

    return {
      callId: "",
      content: resultContent,
      isError: false,
    };
  }
}
