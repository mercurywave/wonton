import { useState, useEffect, useCallback } from "react";
import { Task } from "../types/chat";
import { taskStore } from "../store/tasks";

export function useTasksData(projectId: string | undefined) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }
    setTasks(taskStore.getTasks(projectId));
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        setIsLoading(false);
        setTasks([]);
        return;
      }
      setIsLoading(true);
      await taskStore.load(projectId);
      if (!cancelled) {
        refresh();
        setIsLoading(false);
      }
    })();

    const unsubscribe = taskStore.subscribe(refresh);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projectId, refresh]);

  const createTask = useCallback(
    async (text: string, priority?: Task["priority"]) => {
      if (!projectId) return;
      await taskStore.createTask(projectId, text, priority);
    },
    [projectId]
  );

  const updateTask = useCallback(
    async (taskId: string, updates: Partial<Task>) => {
      if (!projectId) return;
      await taskStore.updateTask(projectId, taskId, updates);
    },
    [projectId]
  );

  const deleteTask = useCallback(
    async (taskId: string) => {
      if (!projectId) return;
      await taskStore.deleteTask(projectId, taskId);
    },
    [projectId]
  );

  const graduateTask = useCallback(
    async (taskId: string, chatId: string) => {
      if (!projectId) return;
      await taskStore.graduateTask(projectId, taskId, chatId);
    },
    [projectId]
  );

  return {
    tasks,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    graduateTask,
  };
}
