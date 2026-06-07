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

export function getAvailableTools(folderPath?: string): ToolDefinition[] {
  if (!folderPath) {
    return [];
  }
  return Object.values(toolHandlers).map((h) => h.definition);
}

export function getToolDefinitions(folderPath: string, agent?: Agent, allAgents?: Agent[]): ToolDefinition[] {
  if (!folderPath) {
    return [];
  }

  const allDefs = Object.values(toolHandlers).map((h) => h.definition);
  const sendHandler = toolHandlers["send"] as ExecuteSubagentHandler | undefined;

  if (sendHandler && agent && agent.defaultToolSet?.includes("send")) {
    return allDefs.map((def) => {
      if (def.function.name === "send") {
        return sendHandler.getDynamicDefinition(agent, allAgents);
      }
      return def;
    });
  }

  return allDefs;
}
