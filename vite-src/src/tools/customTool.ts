import { FlowCustomTool, ToolResult } from "../types/chat";
import { ToolContext, ToolDefinition } from "./handler";
import { buildWon } from "../hooks/useChatWorkflow";

export function getCustomToolDefinitions(flow: { tools?: FlowCustomTool[] }): ToolDefinition[] {
  if (!flow.tools) return [];
  return flow.tools.map((t: FlowCustomTool) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: { type: "object", properties: {} },
    },
  }));
}

export function findCustomTool(flow: { tools?: FlowCustomTool[] }, toolName: string): FlowCustomTool | undefined {
  if (!flow.tools) return undefined;
  return flow.tools.find((t: FlowCustomTool) => t.name === toolName);
}

export async function executeCustomTool(
  tool: FlowCustomTool,
  args: object,
  context: ToolContext,
): Promise<ToolResult> {
  try {
    const won = buildWon(
      context.projectId!,
      context.chatId!,
      context.logId,
      context.showFeedback,
    );

    const fn = new Function("won", "args", `return (async () => {${tool.code}})();`) as (won: any, args: object) => Promise<string>;
    const result = await fn(won, args);
    return { callId: "", content: typeof result === "string" ? result : String(result) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { callId: "", content: `Custom tool error: ${message}`, isError: true };
  }
}
