/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useCallback, useEffect, useRef } from "react";
import { ServerModel } from "../types/chat";

export interface UseServerModelsResult {
  models: ServerModel[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useServerModels(
  serverUrl: string,
  apiKey: string
): UseServerModelsResult {
  const [models, setModels] = useState<ServerModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchModels = useCallback(async () => {
    if (!serverUrl.trim()) {
      setModels([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const baseUrl = serverUrl.replace(/\/+$/, "");
      const response = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Server returned ${response.status}: ${text}`);
      }

      const data = await response.json();
      const modelList: ServerModel[] =
        data.data?.map((m: ServerModel) => ({
          id: m.id,
          object: m.object,
          created: m.created,
          owned_by: m.owned_by,
        })) ?? [];

      setModels(modelList);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to fetch models");
      setModels([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [serverUrl, apiKey]);

  useEffect(() => {
    fetchModels();
    return () => {
      abortRef.current?.abort();
    };
  }, [fetchModels]);

  return { models, isLoading, error, refetch: fetchModels };
}
