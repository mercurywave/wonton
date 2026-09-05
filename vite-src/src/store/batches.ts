import {
  BatchRemoteCacheEntry,
  PorkbunTaskSummary,
  WontonBatchRecord,
  toWontonBatchRecord,
} from "../utils/porkbunApi";
import {
  BATCHES_DIR_NAME,
  isBackendConnected,
  getProjectDataDir,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

type Listener = () => void;

interface BatchState {
  batches: WontonBatchRecord[];
  remoteCache: Record<string, BatchRemoteCacheEntry>;
  isLoaded: boolean;
}

function normalizePersistedBatch(batch: Partial<WontonBatchRecord> & Pick<WontonBatchRecord, "id">): WontonBatchRecord {
  const now = new Date().toISOString();
  return {
    id: batch.id,
    title: batch.title ?? null,
    created_at: batch.created_at ?? now,
    updated_at: batch.updated_at ?? batch.created_at ?? now,
    done_at: batch.done_at ?? null,
    error_message: batch.error_message ?? null,
    task: batch.task,
  };
}

async function listBatches(projectId: string): Promise<WontonBatchRecord[]> {
  if (!isBackendConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

  try {
    const entries = await filesystem.readDirectory(batchesDir);
    const batches: WontonBatchRecord[] = [];

    for (const entry of entries) {
      const name = entry.entry;
      if (!name.endsWith(".json")) continue;

      try {
        const content = await filesystem.readFile(`${batchesDir}/${name}`);
        const batch = JSON.parse(content) as Partial<WontonBatchRecord>;
        if (batch && typeof batch === "object") {
          const normalized = normalizePersistedBatch({
            ...batch,
            id: batch.id ?? name.replace(/\.json$/, ""),
          });
          batches.push(normalized);
        }
      } catch {
        // ignore malformed json files
      }
    }

    return batches.sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
        new Date(a.updated_at ?? a.created_at ?? 0).getTime()
    );
  } catch {
    return [];
  }
}

async function ensureBatchesDir(projectId: string): Promise<void> {
  if (!isBackendConnected()) return;

  const projectDir = await getProjectDataDir(projectId);
  const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

  try {
    await filesystem.createDirectory(batchesDir);
  } catch (err: any) {
    if (err.code !== "EEXIST") {
      console.error("batchStore: failed to create batches dir", err);
    }
  }
}

const state = new Map<string, BatchState>();
const listeners = new Set<Listener>();

function dispatch() {
  for (const listener of listeners) {
    listener();
  }
}

const batchStore = {
  getBatches(projectId: string) {
    return state.get(projectId)?.batches ?? [];
  },

  getRemoteStatuses(projectId: string) {
    return state.get(projectId)?.remoteCache ?? {};
  },

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    await ensureBatchesDir(projectId);
    const batches = await listBatches(projectId);
    state.set(projectId, { batches, remoteCache: {}, isLoaded: true });
    dispatch();
  },

  async upsertBatch(projectId: string, batch: WontonBatchRecord) {
    const localBatch = normalizePersistedBatch({ ...batch, id: batch.id });
    if (!localBatch.id) return;

    const current = state.get(projectId);
    const nextBatchList = current
      ? [localBatch, ...current.batches.filter((item) => item.id !== localBatch.id)]
      : [localBatch];

    state.set(projectId, {
      batches: nextBatchList.sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      ),
      remoteCache: current?.remoteCache ?? {},
      isLoaded: true,
    });

    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

      try {
        await filesystem.writeFile(
          `${batchesDir}/${localBatch.id}.json`,
          JSON.stringify(localBatch, null, 2)
        );
      } catch (err) {
        console.error("batchStore: failed to write batch", err);
      }
    }

    dispatch();
  },

  async replaceAll(projectId: string, batches: PorkbunTaskSummary[]) {
    const current = state.get(projectId) ?? { batches: [], remoteCache: {}, isLoaded: true };
    const nextRemoteCache: Record<string, BatchRemoteCacheEntry> = { ...current.remoteCache };
    const mergedById = new Map<string, WontonBatchRecord>();

    for (const local of current.batches) {
      mergedById.set(local.id, local);
    }

    for (const batch of batches) {
      if (!batch.id) continue;

      const existing = mergedById.get(batch.id);
      const localFromRemote = toWontonBatchRecord(batch, {
        id: batch.id,
        title: existing?.title ?? batch.title ?? null,
        created_at: existing?.created_at ?? batch.created_at ?? null,
        updated_at: existing?.updated_at ?? batch.updated_at ?? batch.created_at ?? null,
        done_at: existing?.done_at ?? (batch.status === "done" ? batch.completed_at ?? batch.updated_at ?? batch.created_at ?? null : null),
        error_message: existing?.error_message ?? batch.error_message ?? null,
        task: { ...(existing?.task ?? {}), ...(batch.task ?? {}) },
      });

      mergedById.set(batch.id, localFromRemote);
      nextRemoteCache[batch.id] = {
        status: batch.status,
        updated_at: batch.updated_at ?? batch.created_at ?? null,
        error_message: batch.error_message ?? null,
        last_checked_at: new Date().toISOString(),
      };
    }

    state.set(projectId, {
      batches: [...mergedById.values()].sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      ),
      remoteCache: nextRemoteCache,
      isLoaded: true,
    });

    dispatch();
  },

  async deleteBatch(projectId: string, batchId: string) {
    const current = state.get(projectId);
    if (!current) return;

    const next = current.batches.filter((batch) => batch.id !== batchId);
    const nextRemoteCache = { ...current.remoteCache };
    delete nextRemoteCache[batchId];

    state.set(projectId, { batches: next, remoteCache: nextRemoteCache, isLoaded: true });

    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;
      try {
        await filesystem.remove(`${batchesDir}/${batchId}.json`);
      } catch (err) {
        console.error("batchStore: failed to delete batch", err);
      }
    }

    dispatch();
  },

  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export { batchStore };
