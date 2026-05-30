import { useState, useCallback } from "react";
import { Flow } from "../types/chat";
import {
  FLOWS_DIR_NAME,
  isNeutralinoConnected,
  getRootDataDir,
} from "../utils/neuUtils";
import { filesystem } from "@neutralinojs/lib";
import { parse as yamlParse } from "yaml";

const STORAGE_KEY = "wonton_flows";
const FLOW_EXT = ".yaml";

function loadCachedFlows(): Flow[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveCachedFlows(flows: Flow[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flows));
  } catch {
    // ignore
  }
}

export async function loadFlowsFromDisk(): Promise<{ flows: Flow[]; flowsPath: string; conflictIds: string[]; conflictFiles: Record<string, string> }> {
  if (!isNeutralinoConnected()) {
    return { flows: loadCachedFlows(), flowsPath: "", conflictIds: [], conflictFiles: {} };
  }

  const rootDir = await getRootDataDir();
  const flowsDir = `${rootDir}/${FLOWS_DIR_NAME}`;

  let entries: { entry: string }[] = [];
  try {
    entries = await filesystem.readDirectory(flowsDir);
  } catch {
    return { flows: loadCachedFlows(), flowsPath: flowsDir, conflictIds: [], conflictFiles: {} };
  }

  const flows: Flow[] = [];
  const flowSources = new Map<string, string>(); // id -> filename
  for (const entry of entries) {
    const name = entry.entry;
    if (!name.endsWith(FLOW_EXT)) continue;

    const filePath = `${flowsDir}/${name}`;

    try {
      const content = await filesystem.readFile(filePath);
      const data = yamlParse(content)! as Record<string, unknown>;
      if(!data.id) throw new Error("id is required");
      if(!data.name) throw new Error("name is required");
      if(typeof data.command === "string") {
        data.isCommand = true;
      }
      flows.push(data as any);
      flowSources.set(data.id as string, name);
    } catch (e) {
      console.warn(`loadFlowsFromDisk: failed to parse ${name}:`, e);
    }
  }

  // Deduplicate by id, logging an error for conflicts and keeping the last loaded.
  const seen = new Map<string, Flow>();
  const conflictIds = new Set<string>();
  const conflictFiles: Record<string, string> = {};
  for (const flow of flows) {
    const id = flow.id;
    if (seen.has(id)) {
      conflictIds.add(id);
      const currentFile = flowSources.get(id) ?? "unknown";
      conflictFiles[id] = currentFile;
      console.error(`loadFlowsFromDisk: conflicting workflow id "${id}" in "${currentFile}" — skipping duplicate.`);
    }
    seen.set(id, flow);
  }
  const deduped = Array.from(seen.values());

  saveCachedFlows(deduped);
  return { flows: deduped, flowsPath: flowsDir, conflictIds: Array.from(conflictIds), conflictFiles };
}

export function useFlows(): [Flow[], () => Promise<void>, string] {
  const [flows, setFlows] = useState<Flow[]>(() => {
    const cached = loadCachedFlows();
    return cached;
  });
  const [flowsPath, setFlowsPath] = useState("");

  const refreshFlows = useCallback(async () => {
    const result = await loadFlowsFromDisk();
    setFlows(result.flows);
    setFlowsPath(result.flowsPath);
  }, []);

  return [flows, refreshFlows, flowsPath];
}
