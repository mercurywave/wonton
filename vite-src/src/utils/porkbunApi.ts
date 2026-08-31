export type PorkbunTaskStatus =
  | "submitted"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "done";

export type WontonBatchStatus =
  | "created"
  | "submitted"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "done"
  | "missing"
  | "unavailable";

export interface WontonBatchRecord {
  id: string;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  done_at?: string | null;
  error_message?: string | null;
  task?: {
    system_prompt?: string;
    user_prompt?: string;
    model?: {
      base_url?: string;
      api_key?: string;
      model_name?: string;
    };
    max_iterations?: number;
    iteration_prompt?: string;
  };
}

export interface BatchRemoteCacheEntry {
  status: PorkbunTaskStatus | "missing" | "unavailable";
  updated_at?: string | null;
  error_message?: string | null;
  last_checked_at?: string | null;
}

export interface PorkbunTaskSummary {
  id: string;
  title?: string | null;
  status: PorkbunTaskStatus;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  output?: Record<string, unknown>;
  task?: {
    system_prompt?: string;
    user_prompt?: string;
    model?: {
      base_url?: string;
      api_key?: string;
      model_name?: string;
    };
    max_iterations?: number;
    iteration_prompt?: string;
  };
}

export interface PorkbunQueueStats {
  submitted: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  total: number;
}

export interface PorkbunHealthStatus {
  status: string;
  queue_len: number;
  time_window_active: boolean;
  timestamp: string;
}

export interface PorkbunClientOptions {
  baseUrl: string;
  apiKey?: string;
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getErrorMessage(value: unknown, fallback: string): string {
  if (value == null) return fallback;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (value instanceof Error) {
    const trimmed = value.message.trim();
    return trimmed || fallback;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;

    for (const key of ["message", "error", "detail", "details", "msg"]) {
      const nested = getErrorMessage(record[key], "");
      if (nested) {
        return nested;
      }
    }

    try {
      const json = JSON.stringify(value);
      if (json && json !== "{}" && json !== "[object Object]") {
        return json;
      }
    } catch {
      // Ignore stringify failures; we only need a best-effort fallback.
    }
  }

  return fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) {
    return {} as T;
  }
  return JSON.parse(text) as T;
}

export class PorkbunClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(options: PorkbunClientOptions) {
    this.baseUrl = stripTrailingSlash(options.baseUrl);
    this.apiKey = options.apiKey;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async fetchHealth(): Promise<PorkbunHealthStatus> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Health check failed (${response.status})`));
    }
    return readJson<PorkbunHealthStatus>(response);
  }

  async fetchQueueStats(): Promise<PorkbunQueueStats> {
    const response = await fetch(`${this.baseUrl}/api/v1/queue/stats`);
    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Queue stats failed (${response.status})`));
    }
    return readJson<PorkbunQueueStats>(response);
  }

  async fetchTask(taskId: string): Promise<PorkbunTaskSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`);
    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Failed to load task ${taskId}`));
    }
    return readJson<PorkbunTaskSummary>(response);
  }

  async listTasks(): Promise<PorkbunTaskSummary[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/queue`);
    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Queue fetch failed (${response.status})`));
    }
    const payload = await readJson<{ tasks?: string[] }>(response);
    const taskIds = payload.tasks ?? [];

    const tasks = await Promise.all(
      taskIds.map(async (id) => this.fetchTask(id))
    );

    return tasks.filter(Boolean);
  }

  async createTask(input: {
    title?: string;
    prompt: string;
    systemPrompt?: string;
    model: string;
    llmServer?: string;
    maxIterations?: number;
    iterationPrompt?: string;
    projectFolderPath?: string;
  }): Promise<PorkbunTaskSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        system_prompt: input.systemPrompt || "You are a careful coding agent.",
        user_prompt: input.prompt,
        base_url: input.llmServer || this.baseUrl,
        api_key: this.apiKey || "",
        model_name: input.model,
        max_iterations: input.maxIterations ?? 1,
        iteration_prompt: input.iterationPrompt || "",
        project_folder_path: input.projectFolderPath,
        title: input.title,
      }),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Task creation failed (${response.status})`));
    }

    return readJson<PorkbunTaskSummary>(response);
  }

  async runTaskNow(taskId: string): Promise<PorkbunTaskSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}/run`, {
      method: "POST",
      headers: this.headers(),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Run action failed (${response.status})`));
    }

    return readJson<PorkbunTaskSummary>(response);
  }

  async downloadTaskArtifact(taskId: string, kind: "zip" | "patch", savePath?: string): Promise<string | null> {
    if (typeof window !== "undefined" && "electronAPI" in window) {
      const ext = kind === "zip" ? "zip" : "patch";
      const targetPath = savePath || (kind === "zip"
        ? await window.electronAPI.os.showSaveDialog("Save Porkbun artifact", `${taskId}.${ext}`)
        : await window.electronAPI.filesystem.getJoinedPath(await window.electronAPI.dataDir.getAppPath(), `tmp/porkbun-${taskId}.${ext}`));

      if (!targetPath) {
        return null;
      }

      await window.electronAPI.os.downloadFile(`${this.baseUrl}/api/v1/tasks/${taskId}/${kind}`, targetPath);
      return targetPath;
    }

    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}/${kind}`);
    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Artifact download failed (${response.status})`));
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${taskId}.${kind}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return null;
  }

  async downloadTaskZip(taskId: string, defaultPath?: string): Promise<string | null> {
    return this.downloadTaskArtifact(taskId, "zip", defaultPath);
  }

  async downloadTaskPatch(taskId: string, defaultPath?: string): Promise<string | null> {
    return this.downloadTaskArtifact(taskId, "patch", defaultPath);
  }

  async cancelTask(taskId: string): Promise<PorkbunTaskSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}`, {
      method: "DELETE",
      headers: this.headers(),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Cancel action failed (${response.status})`));
    }

    return readJson<PorkbunTaskSummary>(response);
  }

  async retryTask(taskId: string): Promise<PorkbunTaskSummary> {
    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}/retry`, {
      method: "POST",
      headers: this.headers(),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Retry action failed (${response.status})`));
    }

    return readJson<PorkbunTaskSummary>(response);
  }

  async activateQueueNow(options?: { startHour?: number; endHour?: number }): Promise<PorkbunHealthStatus> {
    const startHour = Number.isFinite(options?.startHour) ? Math.max(0, Math.min(23, options!.startHour!)) : 9;
    const endHour = Number.isFinite(options?.endHour) ? Math.max(0, Math.min(23, options!.endHour!)) : 17;

    const response = await fetch(`${this.baseUrl}/api/v1/system/config`, {
      method: "PUT",
      headers: this.headers(),
      body: JSON.stringify({ start_hour: startHour, end_hour: endHour }),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Queue activation failed (${response.status})`));
    }

    return this.fetchHealth();
  }
}

export function resolvePorkbunBaseUrl(rawUrl: string): string {
  if (!rawUrl.trim()) return "";
  return rawUrl.replace(/\/+$/, "");
}
