import { Agent } from "../types/chat";
import { DOCS_FOLDER_OVERRIDE } from "./neuUtils";

export const DEFAULT_AGENT: Agent = {
  id: "builtin:default",
  name: "Default",
  systemPrompt: "You are a helpful assistant.",
  main: true,
  defaultToolSet: ["glob", "grep", "read", "write", "edit", "send"],
};

export const SUMMARIZE_AGENT: Agent = {
  id: "builtin:summarize",
  name: "Summarize",
  systemPrompt:
    "You are a summarization assistant. Your job is to condense large inputs into concise, accurate summaries while preserving key information. Be thorough but brief, focusing on the most important points.",
  main: true,
  defaultToolSet: ["glob", "grep", "read"],
};

export const SUBAGENT_AGENT: Agent = {
  id: "builtin:subagent",
  name: "Subagent",
  systemPrompt:
    "You are a specialized subagent. Your task is to complete the specific request given to you by the parent agent. Use the available tools to accomplish the task thoroughly and efficiently. Return a clear, complete result when finished.",
  main: false,
  defaultToolSet: ["glob", "grep", "read", "write", "edit"],
};

export const DOCS_AGENT: Agent = {
  id: "builtin:docs",
  name: "Docs",
  systemPrompt:
    "You are a documentation specialist. You have access to the project's docs folder in the appdata directory. Use glob, grep, read, write, and edit tools to search and manage documentation. When asked about frameworks, APIs, or reference material, check the docs folder for relevant files first.",
  main: true,
  defaultToolSet: ["glob", "grep", "read", "write", "edit", "send"],
  folderOverride: DOCS_FOLDER_OVERRIDE,
};

export const BUILTIN_AGENTS: Agent[] = [DEFAULT_AGENT, SUMMARIZE_AGENT, SUBAGENT_AGENT, DOCS_AGENT];

export function getAgentById(agents: Agent[], id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function getAgentByName(agents: Agent[], name: string): Agent | undefined {
  return agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
}
