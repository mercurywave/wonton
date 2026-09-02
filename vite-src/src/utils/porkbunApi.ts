export type PorkbunTaskStatus =
  | "awaiting_input"
  | "preparing_repo"
  | "submitted"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "done";

export type WontonBatchStatus =
  | "created"
  | "awaiting_input"
  | "preparing_repo"
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
  awaiting_input: number;
  preparing_repo: number;
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

  private async shellQuote(value: string): Promise<string> {
    const platform = await window.electronAPI.dataDir.getPlatform();
    if (platform === "win32") {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  private async resolveGitRepo(folderPath: string): Promise<{ repoRoot: string; repoUrl: string }> {
    const quotedFolderPath = await this.shellQuote(folderPath);
    const repoRootResult = await window.electronAPI.os.execCommand(`git -C ${quotedFolderPath} rev-parse --show-toplevel`, folderPath);
    if (repoRootResult.status !== 0) {
      throw new Error(repoRootResult.stderr || "The selected project is not a valid git repository.");
    }

    const repoRoot = repoRootResult.stdout.trim();
    if (!repoRoot) {
      throw new Error("The selected project does not expose a git repository root.");
    }

    const quotedRepoRoot = await this.shellQuote(repoRoot);
    const remoteResult = await window.electronAPI.os.execCommand(`git -C ${quotedRepoRoot} remote get-url origin`, repoRoot);
    const repoUrl = remoteResult.status === 0 ? remoteResult.stdout.trim() : "";

    if (!repoUrl) {
      throw new Error("The selected project repository has no origin remote configured.");
    }

    return { repoRoot, repoUrl };
  }

  private async generatePatchFile(projectFolderPath: string, taskId: string): Promise<string | null> {
    if (typeof window === "undefined" || !("electronAPI" in window)) {
      throw new Error("Patch generation requires a local Electron environment.");
    }

    const appPath = await window.electronAPI.dataDir.getAppPath();
    const tmpDir = await window.electronAPI.filesystem.getJoinedPath(appPath, "tmp");
    await window.electronAPI.filesystem.createDirectory(tmpDir);
    const patchPath = await window.electronAPI.filesystem.getJoinedPath(tmpDir, `porkbun-${taskId}.patch`);

    const quotedProjectFolderPath = await this.shellQuote(projectFolderPath);
    const repoCheck = await window.electronAPI.os.execCommand(`git -C ${quotedProjectFolderPath} rev-parse --is-inside-work-tree`, projectFolderPath);
    if (repoCheck.status !== 0 || !repoCheck.stdout.trim().includes("true")) {
      throw new Error("The selected project is not a git repository, so no patch can be uploaded.");
    }

    const quotedPatchPath = await this.shellQuote(patchPath);
    const commands = [
      `git -C ${quotedProjectFolderPath} add -N -A`,
      `git -C ${quotedProjectFolderPath} diff --binary -- . > ${quotedPatchPath}`,
    ];

    for (const command of commands) {
      const result = await window.electronAPI.os.execCommand(command, projectFolderPath);
      if (result.status !== 0 && !result.stderr?.includes("nothing to commit")) {
        throw new Error(result.stderr || "Failed to generate the local patch file.");
      }
    }

    const patchContent = await window.electronAPI.filesystem.readFile(patchPath);
    if (!patchContent.trim()) {
      return null;
    }

    return patchPath;
  }

  async uploadPatch(taskId: string, patchFilePath: string): Promise<PorkbunTaskSummary> {
    if (typeof window === "undefined" || !("electronAPI" in window)) {
      throw new Error("Patch upload requires a local Electron environment.");
    }

    const patchContent = await window.electronAPI.filesystem.readFile(patchFilePath);
    if (!patchContent.trim()) {
      throw new Error("The generated patch is empty and cannot be uploaded.");
    }

    const form = new FormData();
    form.append("patch_file", new File([patchContent], "local.patch", { type: "application/octet-stream" }));

    const response = await fetch(`${this.baseUrl}/api/v1/tasks/${taskId}/patch`, {
      method: "POST",
      body: form,
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Patch upload failed (${response.status})`));
    }

    return readJson<PorkbunTaskSummary>(response);
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
    repoUrl?: string;
    sourceType?: "git" | "git_patch" | "zip";
  }): Promise<PorkbunTaskSummary> {
    const requestedSourceType = input.sourceType ?? "git_patch";
    let effectiveSourceType = requestedSourceType;
    let preflightPatchPath: string | null = null;

    if ((requestedSourceType === "git" || requestedSourceType === "git_patch") && input.projectFolderPath) {
      const resolvedRepo = await this.resolveGitRepo(input.projectFolderPath);
      const repoUrl = resolvedRepo.repoUrl;

      if (requestedSourceType === "git_patch") {
        preflightPatchPath = await this.generatePatchFile(input.projectFolderPath, `preflight-${Date.now()}`);
        if (preflightPatchPath === null) {
          effectiveSourceType = "git";
        }
      }

      if (!input.repoUrl) {
        input.repoUrl = repoUrl;
      }
    }

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
        source_type: effectiveSourceType,
        repo_url: input.repoUrl || "",
      }),
    });

    if (!response.ok) {
      const payload = await readJson<{ error?: unknown }>(response);
      throw new Error(getErrorMessage(payload.error, `Task creation failed (${response.status})`));
    }

    const created = await readJson<PorkbunTaskSummary>(response);

    if (effectiveSourceType === "git_patch" && input.projectFolderPath && created.id) {
      const patchPath = await this.generatePatchFile(input.projectFolderPath, created.id);
      if (patchPath) {
        await this.uploadPatch(created.id, patchPath);
      }
      return this.fetchTask(created.id);
    }

    return created;
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
