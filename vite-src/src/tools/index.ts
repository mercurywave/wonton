import { ToolCall, ToolDefinition, ToolResult } from "../types/chat";
import { ToolContext, ToolHandler } from "./handler";
export type { ToolContext, ToolHandler } from "./handler";
import { SearchFilesHandler } from "./searchFiles";
import { SearchContentsHandler } from "./searchContents";
import { ReadFileHandler } from "./readFile";
import { WriteFileHandler } from "./writeFile";
import { EditFileHandler } from "./editFile";
import { ExecuteSubagentHandler } from "./executeSubagent";
import { Agent } from "../types/chat";
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

export async function filterToAvailableTools(toolNames: string[], folderPath?: string, agent?: Agent, allAgents?: Agent[]): Promise<ToolDefinition[]> {
  return await filterAndCleanTools(
    Object.values(toolHandlers).filter(h => toolNames.includes(h.name)), 
    folderPath,
    agent,
    allAgents
  );
}

export async function getAvailableTools(folderPath?: string, agent?: Agent, allAgents?: Agent[]): Promise<ToolDefinition[]> {
  return await filterAndCleanTools(Object.values(toolHandlers), folderPath, agent, allAgents);
}

async function filterAndCleanTools(allTools: ToolHandler[], folderPath?: string, agent?: Agent, allAgents?: Agent[]): Promise<ToolDefinition[]> {
  const availableAgents = (allAgents && agent && agent.subagentAllowlist) 
    ? allAgents.filter(a => agent.subagentAllowlist?.includes(a.id))
    : allAgents;

  const allowedTools = agent?.defaultToolSet
    ? allTools.filter(t => agent.defaultToolSet!.includes(t.name))
    : allTools;

  const filtered = allowedTools.filter((h) => {
    if(h.isAvailable){
      return h.isAvailable(folderPath, agent, availableAgents);
    }
    return true;
  });

  return await Promise.all(filtered.map(async (h) => {
    if(h.getToolDefinitions){
      return h.getToolDefinitions(folderPath, agent, availableAgents);
    }
    return h.definition;
  }));
}