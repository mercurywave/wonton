import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMeta, ChatMessage, ProjectMeta } from "../types/chat";
import {
  loadMessages as loadMessagesNative,
  clearChat as clearChatNative,
} from "./useChatPersistence";
import { projectMetaStore } from "../store/projectMeta";
import { chatStore } from "../store/chats";

const chatCache = new Map<string, ChatMessage[]>();

export function useProjectChats(projectId: string | undefined) {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatExecutionIds, setChatExecutionIds] = useState<Map<string, string>>(new Map());
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
    chatCache.delete(chatId);
  }, [projectId]);

  const renameChat = useCallback(async (chatId: string, name: string) => {
    if (!projectId) return;
    await chatStore.renameChat(projectId, chatId, name);
    setChats(chatStore.getChatMetas(projectId));
  }, [projectId]);

  const loadChatMessages = useCallback(async (chatId: string): Promise<ChatMessage[]> => {
    if (!projectId) return [];
    if (chatCache.has(chatId)) {
      return chatCache.get(chatId)!;
    }
    const msgs = await loadMessagesNative(projectId, chatId);
    chatCache.set(chatId, msgs);
    return msgs;
  }, [projectId]);

  const clearChatMessages = useCallback(async (chatId: string) => {
    if (!projectId) return;
    await clearChatNative(projectId, chatId);
    chatCache.delete(chatId);
  }, [projectId]);

  const setChatExecutionId = useCallback((chatId: string, executionId: string | null) => {
    setChatExecutionIds((prev) => {
      const next = new Map(prev);
      if(executionId) {
        next.set(chatId, executionId);
      } else {
        next.delete(chatId);
      }
      return next;
    })
  }, []);

  const updateChatMeta = useCallback(async (chatId: string, updates: Partial<ChatMeta>) => {
    if (!projectId) return;
    await chatStore.updateChatMeta(projectId, chatId, updates);
    setChats(chatStore.getChatMetas(projectId));
  }, [projectId]);

  return {
    chats,
    projectMeta,
    isLoading,
    chatExecutionIds,
    createChat,
    deleteChat,
    renameChat,
    loadChatMessages,
    clearChatMessages,
    refreshChats: refreshChatsCb,
    loadMeta,
    setChatExecutionId,
    updateChatMeta,
  };
}
