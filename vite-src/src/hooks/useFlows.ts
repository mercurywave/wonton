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

export async function loadFlowsFromDisk(): Promise<{ flows: Flow[]; flowsPath: string }> {
  if (!isNeutralinoConnected()) {
    return { flows: loadCachedFlows(), flowsPath: "" };
  }

  const rootDir = await getRootDataDir();
  const flowsDir = `${rootDir}/${FLOWS_DIR_NAME}`;

  let entries: { entry: string }[] = [];
  try {
    entries = await filesystem.readDirectory(flowsDir);
  } catch {
    return { flows: loadCachedFlows(), flowsPath: flowsDir };
  }

  const flows: Flow[] = [];
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
    } catch (e) {
      console.warn(`loadFlowsFromDisk: failed to parse ${name}:`, e);
    }
  }

  saveCachedFlows(flows);
  return { flows, flowsPath: flowsDir };
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
