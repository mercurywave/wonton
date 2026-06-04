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
import { isNeutralinoConnected } from "../utils/neuUtils";
import { Task } from "../types/chat";

interface TasksContextValue {
  tasks: Task[];
  isLoading: boolean;
  createTask: (text: string, priority?: Task["priority"]) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  graduateTask: (taskId: string, chatId: string) => Promise<void>;
  createChatAndGraduate: (taskId: string) => Promise<void>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

export function TasksProvider({ children }: { children: ReactNode }) {
  const { activeProjectId } = useNav();
  const { createChat } = useChats();

  const {
    tasks,
    isLoading,
    createTask,
    updateTask,
    deleteTask,
    graduateTask,
  } = useTasksData(isNeutralinoConnected() ? (activeProjectId ?? undefined) : undefined);

  const createChatAndGraduateRef = useRef(async (taskId: string) => {
    const chat = await createChat();
    await graduateTask(taskId, chat.id);
  });

  useEffect(() => {
    createChatAndGraduateRef.current = async (taskId: string) => {
      const chat = await createChat();
      await graduateTask(taskId, chat.id);
    };
  }, [createChat, graduateTask]);

  const createChatAndGraduate = useCallback(async (taskId: string) => {
    await createChatAndGraduateRef.current(taskId);
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      isLoading,
      createTask,
      updateTask,
      deleteTask,
      graduateTask,
      createChatAndGraduate,
    }),
    [tasks, isLoading, createTask, updateTask, deleteTask, graduateTask, createChatAndGraduate]
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
