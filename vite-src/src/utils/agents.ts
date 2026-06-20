import { Agent } from "../types/chat";
import { DOCS_FOLDER_OVERRIDE, DOCS_DIR_NAME, getProjectDataDir } from "./platformUtils";

export const DEFAULT_AGENT: Agent = {
  id: "builtin:default",
  name: "Default",
  systemPrompt: "You are a helpful assistant.",
  main: true,
  defaultToolSet: ["glob", "grep", "read", "write", "edit", "message"],
  subagentAllowlist: ["builtin:subagent", "builtin:explore", "builtin:docs"],
};

export const EXPLORE_AGENT: Agent = {
  id: "builtin:explore",
  name: "Explore",
  systemPrompt:
    "Explore the project structure and code. Summarize key findings, architecture, and dependencies in concise executive summaries",
  main: false,
  defaultToolSet: ["glob", "grep", "read"],
  subagentAllowlist: [],
};

export const SUBAGENT_AGENT: Agent = {
  id: "builtin:subagent",
  name: "Subagent",
  systemPrompt:
    "You are a specialized subagent. Your task is to complete the specific request given to you by the main agent. Use the available tools to accomplish the task thoroughly and efficiently. Return a clear, complete result when finished.",
  main: false,
  defaultToolSet: ["glob", "grep", "read", "write", "edit"],
  subagentAllowlist: [],
};

export const DOCS_AGENT: Agent = {
  id: "builtin:docs",
  name: "Docs",
  systemPrompt:
    "You are a documentation specialist. You have access to the project's docs folder in the appdata directory. Use your tools to search and manage documentation. When asked about frameworks, APIs, or reference material, check the docs folder for relevant files first.",
  main: true,
  defaultToolSet: ["glob", "grep", "read", "write", "edit", "message"],
  folderOverride: DOCS_FOLDER_OVERRIDE,
  subagentAllowlist: [],
};

export const BASH_AGENT: Agent = {
  id: "builtin:bash",
  name: "Bash",
  systemPrompt: "You are a helpful assistant.",
  main: true,
  defaultToolSet: ["glob", "grep", "read", "write", "edit", "message", "exec"],
  subagentAllowlist: ["builtin:subagent", "builtin:explore", "builtin:docs"],
};

export const BUILTIN_AGENTS: Agent[] = [DEFAULT_AGENT, EXPLORE_AGENT, SUBAGENT_AGENT, DOCS_AGENT, BASH_AGENT];

export function getAgentById(agents: Agent[], id: string): Agent | undefined {
  return agents.find((a) => a.id === id);
}

export function getAgentByName(agents: Agent[], name: string): Agent | undefined {
  return agents.find((a) => a.name.toLowerCase() === name.toLowerCase());
}

export function getAvailableSubagents(agent: Agent, allAgents: Agent[]): Agent[] {
  const allowlist = agent.subagentAllowlist;

  let candidates: Agent[];
  if (!allowlist || allowlist.length === 0) {
    // No allowlist or empty = all agents except self
    candidates = allAgents.filter((a) => a.id !== agent.id);
  } else {
    // Filter to only agents in the allowlist
    candidates = allAgents.filter((a) => allowlist.includes(a.id) && a.id !== agent.id);
  }

  return candidates;
}

export async function resolveAgentFolderPath(agent: Agent, baseFolderPath: string | undefined, projectId: string): Promise<string | undefined> {
  if (agent.folderOverride === DOCS_FOLDER_OVERRIDE) {
    const projectDir = await getProjectDataDir(projectId);
    if (projectDir) {
      return `${projectDir}/${DOCS_DIR_NAME}`;
    }
  }
  return baseFolderPath;
}
