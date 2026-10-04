import { ToolCall, ToolDefinition, ToolResult, Agent } from "../types/chat";
import { ToolContext, ToolHandler } from "./handler";
export type { ToolContext, ToolHandler } from "./handler";
import { SearchFilesHandler } from "./searchFiles";
import { SearchContentsHandler } from "./searchContents";
import { ReadFileHandler } from "./readFile";
import { WriteFileHandler } from "./writeFile";
import { EditFileHandler } from "./editFile";
import { ExecuteSubagentHandler } from "./executeSubagent";
import { ExecCommandHandler } from "./execCommand";

const toolHandlers: Record<string, ToolHandler> = {};

export function registerTool(handler: ToolHandler): void {
  toolHandlers[handler.name] = handler;
}

registerTool(SearchFilesHandler.getInstance());
registerTool(SearchContentsHandler.getInstance());
registerTool(ReadFileHandler.getInstance());
registerTool(WriteFileHandler.getInstance());
registerTool(EditFileHandler.getInstance());
registerTool(ExecuteSubagentHandler.getInstance());
registerTool(ExecCommandHandler.getInstance());

export function getToolHandler(toolName: string): ToolHandler | undefined {
  return toolHandlers[toolName];
}

export async function executeToolCall(
  toolName: string,
  toolCall: ToolCall,
  args: object,
  context: ToolContext
): Promise<ToolResult> {
  const handler = getToolHandler(toolName);
  if (!handler) {
    return {
      callId: "",
      content: `Error: Unknown tool "${toolName}"`,
      isError: true,
    };
  }
  return handler.execute(args, context, toolCall);
}

export async function filterToAvailableTools(toolNames: string[], folderPath?: string, agent?: Agent, allAgents?: Agent[], enabledToolNames?: string[]): Promise<ToolDefinition[]> {
  return await filterAndCleanTools(
    Object.values(toolHandlers).filter(h => toolNames.includes(h.name)), 
    folderPath,
    agent,
    allAgents,
    enabledToolNames
  );
}

export async function getAvailableTools(
  folderPath?: string,
  agent?: Agent,
  allAgents?: Agent[],
  enabledToolNames?: string[],
): Promise<ToolDefinition[]> {
  return await filterAndCleanTools(Object.values(toolHandlers), folderPath, agent, allAgents, enabledToolNames);
}

export async function getOptionalTools(folderPath?: string, agent?: Agent, allAgents?: Agent[]): Promise<ToolDefinition[]> {
  const availableAgents = (allAgents && agent && agent.subagentAllowlist) 
    ? allAgents.filter(a => agent.subagentAllowlist?.includes(a.id))
    : allAgents;

  const allToolHandlers = Object.values(toolHandlers);
  
  // Get the agent's base tool set (after tool-level overrides)
  const agentToolNames = resolveAgentToolSet(allToolHandlers, agent);
  
  // Apply tool-level overrides to get the final effective set
  const effectiveToolNames = new Set(agentToolNames);
  for (const tool of allToolHandlers) {
    if (tool.addToAgents?.includes(agent?.id ?? "")) {
      effectiveToolNames.add(tool.name);
    }
    if (tool.hiddenFromAgents?.includes(agent?.id ?? "")) {
      effectiveToolNames.delete(tool.name);
    }
  }
  
  // Get tools that are available but NOT in the agent's effective set
  const optionalTools = allToolHandlers.filter((h) => {
    // This tool is NOT in the agent's effective set - that's the whole point
    if (effectiveToolNames.has(h.name)) {
      return false;
    }
    // Check isAvailable filter
    if (h.isAvailable) {
      return h.isAvailable(folderPath, agent, availableAgents);
    }
    return true;
  });

  return await Promise.all(optionalTools.map(async (h) => {
    if (h.getToolDefinitions) {
      return h.getToolDefinitions(folderPath, agent, availableAgents);
    }
    return h.definition;
  }));
}

export { executeCustomTool, getCustomToolDefinitions, findCustomTool } from "./customTool";

export function getAllToolNames(): string[] {
  return Object.values(toolHandlers).map(h => h.name);
}

function resolveAgentToolSet(
  allTools: ToolHandler[],
  agent?: Agent,
): Set<string> {
  if (!agent) {
    return new Set(allTools.map((t) => t.name));
  }

  // Layer 1: Agent-level base set via toolPermissions (or fallback defaultToolSet)
  const toolNames = new Set(allTools.map((t) => t.name));
  const agentToolNames = new Set<string>();

  if (agent.toolPermissions) {
    if (agent.toolPermissions.mode === "include") {
      // Agent wants only these specific tools
      for (const name of agent.toolPermissions.tools) {
        agentToolNames.add(name);
      }
    } else {
      // Agent wants all tools except these
      for (const name of toolNames) {
        if (!agent.toolPermissions.tools.includes(name)) {
          agentToolNames.add(name);
        }
      }
    }
  } else if (agent.defaultToolSet) {
    // Fallback: treat old defaultToolSet as "include" mode
    for (const name of agent.defaultToolSet) {
      agentToolNames.add(name);
    }
  }

  return agentToolNames;
}

async function filterAndCleanTools(
  allTools: ToolHandler[],
  folderPath?: string,
  agent?: Agent,
  allAgents?: Agent[],
  enabledToolNames?: string[],
): Promise<ToolDefinition[]> {
  const availableAgents = (allAgents && agent && agent.subagentAllowlist) 
    ? allAgents.filter(a => agent.subagentAllowlist?.includes(a.id))
    : allAgents;

  // Step 1: Agent-level base set
  let allowedNames = resolveAgentToolSet(allTools, agent);

  // Step 2 & 3: Tool-level overrides
  // For each tool, check if it should be added/hidden from this agent
  for (const tool of allTools) {
    if (tool.addToAgents?.includes(agent?.id ?? "")) {
      allowedNames.add(tool.name);
    }
    if (tool.hiddenFromAgents?.includes(agent?.id ?? "")) {
      allowedNames.delete(tool.name);
    }
  }

  // Step 4: Union with enabledToolNames (optional/user-enabled tools)
  if (enabledToolNames) {
    const enabledSet = new Set(enabledToolNames);
    for (const name of enabledSet) {
      allowedNames.add(name);
    }
  }

  const filtered = allTools
    .filter((h) => allowedNames.has(h.name))
    .filter((h) => {
      if (h.isAvailable) {
        return h.isAvailable(folderPath, agent, availableAgents);
      }
      return true;
    });

  return await Promise.all(filtered.map(async (h) => {
    if (h.getToolDefinitions) {
      return h.getToolDefinitions(folderPath, agent, availableAgents);
    }
    return h.definition;
  }));
}