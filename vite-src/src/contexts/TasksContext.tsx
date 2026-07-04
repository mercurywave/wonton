import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useTasksData } from "../hooks/useTasksData";
import { useNav } from "./NavContext";
import { useChats } from "./ChatsContext";
import { isBackendConnected } from "../utils/platformUtils";
import { Task } from "../types/chat";
import { PRIORITY_ORDER } from "../utils/taskUtils";

interface TasksContextValue {
  tasks: Task[];
  isLoading: boolean;
  createTask: (text: string, priority?: Task["priority"]) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  graduateTask: (taskId: string, chatId: string) => Promise<void>;
  createChatAndGraduate: (taskId: string) => Promise<void>;
  createChatAndGraduateWithId: (taskId: string) => Promise<string>;
  getSortedActiveTasks: () => Task[];
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { activeProjectId } = useNav();
  const { createChat, updateChatMeta } = useChats();

  const {
    tasks,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    graduateTask: graduateTaskBase,
  } = useTasksData(isBackendConnected() ? (activeProjectId ?? undefined) : undefined);

  const wrappedGraduateTask = useCallback(async (taskId: string, chatId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    await graduateTaskBase(taskId, chatId);
    if (task && chatId) {
      await updateChatMeta("", chatId, { draft: task.text });
    }
  }, [tasks, graduateTaskBase, updateChatMeta]);

  const createChatAndGraduateRef = useRef(async (taskId: string) => {
    const chat = await createChat();
    await wrappedGraduateTask(taskId, chat.id);
  });

  useEffect(() => {
    createChatAndGraduateRef.current = async (taskId: string) => {
      const chat = await createChat();
      await wrappedGraduateTask(taskId, chat.id);
    };
  }, [createChat, wrappedGraduateTask]);

  const createChatAndGraduate = useCallback(async (taskId: string) => {
    await createChatAndGraduateRef.current(taskId);
  }, []);

  const getSortedActiveTasks = useMemo(() => {
    return () => {
      const active = tasks.filter((t) => !t.graduatedAt);
      return [...active].sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority || "low"] - PRIORITY_ORDER[b.priority || "low"]) ||
          b.createdAt - a.createdAt
      );
    };
  }, [tasks]);

  const createChatAndGraduateWithId = useCallback(async (taskId: string): Promise<string> => {
    const chat = await createChat();
    await wrappedGraduateTask(taskId, chat.id);
    return chat.id;
  }, [createChat, wrappedGraduateTask]);

  const value = useMemo(
    () => ({
      tasks,
      isLoading,
      createTask,
      updateTask,
      deleteTask,
      graduateTask: wrappedGraduateTask,
      createChatAndGraduate,
      createChatAndGraduateWithId,
      getSortedActiveTasks,
    }),
    [tasks, isLoading, createTask, updateTask, deleteTask, wrappedGraduateTask, createChatAndGraduate, createChatAndGraduateWithId, getSortedActiveTasks]
  );

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks(): TasksContextValue {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error("useTasks must be used within a TasksProvider");
  }
  return ctx;
}
