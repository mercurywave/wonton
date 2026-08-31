import { PorkbunTaskSummary } from "../utils/porkbunApi";
import {
  BATCHES_DIR_NAME,
  isBackendConnected,
  getProjectDataDir,
} from "../utils/platformUtils";
import { filesystem } from "../utils/electronFs";

type Listener = () => void;

interface BatchState {
  batches: PorkbunTaskSummary[];
  isLoaded: boolean;
}

async function listBatches(projectId: string): Promise<PorkbunTaskSummary[]> {
  if (!isBackendConnected()) return [];

  const projectDir = await getProjectDataDir(projectId);
  const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

  try {
    const entries = await filesystem.readDirectory(batchesDir);
    const batches: PorkbunTaskSummary[] = [];

    for (const entry of entries) {
      const name = entry.entry;
      if (!name.endsWith(".json")) continue;

      try {
        const content = await filesystem.readFile(`${batchesDir}/${name}`);
        const batch = JSON.parse(content) as PorkbunTaskSummary;
        if (batch && typeof batch === "object") {
          if (!batch.id) {
            batch.id = name.replace(/\.json$/, "");
          }
          batches.push(batch);
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

  async load(projectId: string) {
    const existing = state.get(projectId);
    if (existing?.isLoaded) return;

    await ensureBatchesDir(projectId);
    const batches = await listBatches(projectId);
    state.set(projectId, { batches, isLoaded: true });
    dispatch();
  },

  async upsertBatch(projectId: string, batch: PorkbunTaskSummary) {
    if (!batch.id) return;

    const current = state.get(projectId);
    const nextBatchList = current
      ? [batch, ...current.batches.filter((item) => item.id !== batch.id)]
      : [batch];

    state.set(projectId, {
      batches: nextBatchList.sort(
        (a, b) =>
          new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
          new Date(a.updated_at ?? a.created_at ?? 0).getTime()
      ),
      isLoaded: true,
    });

    if (isBackendConnected()) {
      const projectDir = await getProjectDataDir(projectId);
      const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

      try {
        await filesystem.writeFile(
          `${batchesDir}/${batch.id}.json`,
          JSON.stringify(batch, null, 2)
        );
      } catch (err) {
        console.error("batchStore: failed to write batch", err);
      }
    }

    dispatch();
  },

  async replaceAll(projectId: string, batches: PorkbunTaskSummary[]) {
    const incoming = [...batches].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
        new Date(a.updated_at ?? a.created_at ?? 0).getTime()
    );

    const current = state.get(projectId)?.batches ?? [];
    const byId = new Map(current.map((batch) => [batch.id, batch]));

    for (const batch of incoming) {
      if (!batch.id) continue;
      const existing = byId.get(batch.id);
      if (!existing || new Date(existing.updated_at ?? existing.created_at ?? 0).getTime() <= new Date(batch.updated_at ?? batch.created_at ?? 0).getTime()) {
        byId.set(batch.id, batch);
      }
    }

    const merged = [...byId.values()].sort(
      (a, b) =>
        new Date(b.updated_at ?? b.created_at ?? 0).getTime() -
        new Date(a.updated_at ?? a.created_at ?? 0).getTime()
    );

    state.set(projectId, { batches: merged, isLoaded: true });

    if (isBackendConnected()) {
      await ensureBatchesDir(projectId);
      const projectDir = await getProjectDataDir(projectId);
      const batchesDir = `${projectDir}/${BATCHES_DIR_NAME}`;

      for (const batch of incoming) {
        if (!batch.id) continue;
        try {
          await filesystem.writeFile(
            `${batchesDir}/${batch.id}.json`,
            JSON.stringify(batch, null, 2)
          );
        } catch (err) {
          console.error("batchStore: failed to persist batch", err);
        }
      }

      // Wonton owns the batch registry locally. Remote task listings are advisory
      // and may contain only a subset of jobs, so we do not prune local entries here.
    }

    dispatch();
  },

  async deleteBatch(projectId: string, batchId: string) {
    const current = state.get(projectId);
    if (!current) return;

    const next = current.batches.filter((batch) => batch.id !== batchId);
    state.set(projectId, { batches: next, isLoaded: true });

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
