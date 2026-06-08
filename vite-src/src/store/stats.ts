import { StatsEntry } from "../types/chat";
import {
  isBackendConnected,
  getRootDataDir,
  generateGuid,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

const STATS_DIR_NAME = "stats";

function getStatsDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function _getStatsFilePath(dateStr: string): Promise<string> {
  const rootDir = await getRootDataDir();
  const statsDir = `${rootDir}/${STATS_DIR_NAME}`;
  if (isBackendConnected()) {
    try {
      await filesystem.createDirectory(statsDir);
    } catch {
      // directory might already exist — ignore
    }
  }
  return `${statsDir}/stats-${dateStr}.jsonl`;
}

async function _appendEntry(jsonlPath: string, entry: StatsEntry): Promise<void> {
  if (!isBackendConnected()) return;
  const line = JSON.stringify(entry) + "\n";
  await filesystem.appendFile(jsonlPath, line);
}

async function _readEntries(jsonlPath: string): Promise<StatsEntry[]> {
  try {
    const content = await filesystem.readFile(jsonlPath);
    if (!content.trim()) return [];
    const lines = content.trim().split("\n");
    const entries: StatsEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line) as StatsEntry);
      } catch {
        // ignore malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

async function _deleteFile(jsonlPath: string): Promise<void> {
  try {
    await filesystem.remove(jsonlPath);
  } catch {
    // file might not exist — ignore
  }
}

const statsStore = {
  async appendEntry(
    projectId: string,
    chatId: string,
    logId: string,
    model: string,
    agentId: string,
    promptTokens: number,
    completionTokens: number,
    totalTokens: number,
    timeMs: number,
    cacheN?: number,
    promptN?: number,
    promptMs?: number,
    promptPerTokenMs?: number,
    promptPerSecond?: number,
    predictedN?: number,
    predictedMs?: number,
    predictedPerTokenMs?: number,
    predictedPerSecond?: number
  ): Promise<void> {
    if (!isBackendConnected()) {
      console.warn("statsStore: skipping entry — not in Electron mode");
      return;
    }

    const now = new Date();
    const dateStr = getStatsDate(now);
    const jsonlPath = await _getStatsFilePath(dateStr);

    const entry: StatsEntry = {
      id: generateGuid(),
      timestamp: now.getTime(),
      projectId,
      chatId,
      logId,
      model,
      agentId,
      promptTokens,
      completionTokens,
      totalTokens,
      timeMs,
      cacheN,
      promptN,
      promptMs,
      promptPerTokenMs,
      promptPerSecond,
      predictedN,
      predictedMs,
      predictedPerTokenMs,
      predictedPerSecond,
    };

    await _appendEntry(jsonlPath, entry);
  },

  async loadDay(dateStr: string): Promise<StatsEntry[]> {
    const jsonlPath = await _getStatsFilePath(dateStr);
    return _readEntries(jsonlPath);
  },

  async loadRange(startDate: string, endDate: string): Promise<StatsEntry[]> {
    const entries: StatsEntry[] = [];
    const [startY, startM, startD] = startDate.split("-").map(Number);
    const [endY, endM, endD] = endDate.split("-").map(Number);
    const current = new Date(startY, startM - 1, startD);
    const end = new Date(endY, endM - 1, endD);

    while (current <= end) {
      const dateStr = getStatsDate(current);
      const dayEntries = await this.loadDay(dateStr);
      entries.push(...dayEntries);
      current.setDate(current.getDate() + 1);
    }

    return entries;
  },

  async clearDay(dateStr: string): Promise<void> {
    const jsonlPath = await _getStatsFilePath(dateStr);
    await _deleteFile(jsonlPath);
  },
};

export { statsStore };
