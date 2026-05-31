import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMeta, ChatMessage, ProjectMeta } from "../types/chat";
import { clearChat as clearChatNative } from "./useChatPersistence";
import { projectMetaStore } from "../store/projectMeta";
import { chatStore } from "../store/chats";
import { chatLogsStore } from "../store/chatLogs";

export function useProjectChats(projectId: string | undefined) {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadMetaCountRef = useRef(0);
  const loadChatsCountRef = useRef(0);

  const refreshMeta = useCallback(() => {
    setProjectMeta(projectMetaStore.getProjectMeta(projectId!));
  }, [projectId]);

  const loadMeta = useCallback(async () => {
    if (!projectId) return;
    const currentLoad = ++loadMetaCountRef.current;
    await projectMetaStore.load(projectId);
    if (currentLoad !== loadMetaCountRef.current) return;
    setProjectMeta(projectMetaStore.getProjectMeta(projectId));
  }, [projectId]);

  const loadChats = useCallback(async () => {
    if (!projectId) {
      setChats([]);
      return;
    }
    const currentLoad = ++loadChatsCountRef.current;
    setIsLoading(true);
    await chatStore.load(projectId);
    if (currentLoad !== loadChatsCountRef.current) return;
    setChats(chatStore.getChatMetas(projectId));
    setIsLoading(false);
  }, [projectId]);

  const refreshChatsCb = useCallback(async () => {
    if (!projectId) return [];
    const metas = await chatStore.refresh(projectId);
    setChats(metas);
    return metas;
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadMeta();
      loadChats();
      const unsubscribe = projectMetaStore.subscribe(projectId, refreshMeta);
      const unsubscribeChats = chatStore.subscribe(projectId, () => {
        setChats(chatStore.getChatMetas(projectId));
      });
      return () => {
        unsubscribe();
        unsubscribeChats();
      };
    }
  }, [projectId, loadMeta, loadChats, refreshMeta]);

  const createChat = useCallback(async (workflowId?: string, workflowStateKey?: string): Promise<ChatMeta> => {
    if (!projectId) throw new Error("No project ID");
    const chat = await chatStore.createChat(projectId, undefined, workflowId, workflowStateKey);
    setChats(chatStore.getChatMetas(projectId));
    return chat;
  }, [projectId]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!projectId) return;
    await chatStore.deleteChat(projectId, chatId);
    setChats(chatStore.getChatMetas(projectId));
  }, [projectId]);

  const renameChat = useCallback(async (chatId: string, name: string) => {
    if (!projectId) return;
    await chatStore.renameChat(projectId, chatId, name);
    setChats(chatStore.getChatMetas(projectId));
  }, [projectId]);

  const loadChatMessages = useCallback(async (chatId: string): Promise<ChatMessage[]> => {
    if (!projectId) return [];
    await chatStore.load(projectId);
    const logId = chatStore.getLogId(projectId, chatId);
    await chatLogsStore.load(projectId, logId);
    return chatLogsStore.getLog(projectId, logId) || [];
  }, [projectId]);

  const clearChatMessages = useCallback(async (chatId: string) => {
    if (!projectId) return;
    await chatStore.load(projectId);
    const logId = chatStore.getLogId(projectId, chatId);
    await clearChatNative(projectId, chatId);
    chatLogsStore.clearLog(projectId, logId);
  }, [projectId]);

  const updateChatMeta = useCallback(async (chatId: string, updates: Partial<ChatMeta>) => {
    if (!projectId) return;
    await chatStore.updateChatMeta(projectId, chatId, updates);
    setChats(chatStore.getChatMetas(projectId));
  }, [projectId]);

  return {
    chats,
    projectMeta,
    isLoading,
    createChat,
    deleteChat,
    renameChat,
    loadChatMessages,
    clearChatMessages,
    refreshChats: refreshChatsCb,
    loadMeta,
    updateChatMeta,
  };
}
