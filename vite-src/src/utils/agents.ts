import { Agent } from "../types/chat";

export const DEFAULT_AGENT: Agent = {
  id: "builtin:default",
  name: "Default",
  systemPrompt: "You are a helpful assistant.",
  main: true,
};

export const SUMMARIZE_AGENT: Agent = {
  id: "builtin:summarize",
  name: "Summarize",
  systemPrompt:
    "You are a summarization assistant. Your job is to condense large inputs into concise, accurate summaries while preserving key information. Be thorough but brief, focusing on the most important points.",
  main: true,
};

export const BUILTIN_AGENTS: Agent[] = [DEFAULT_AGENT, SUMMARIZE_AGENT];

export function getAgentById(agents: Agent[], id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}
