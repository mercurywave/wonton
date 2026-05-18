import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMeta, ChatMessage, ProjectMeta } from "../types/chat";
import {
  listChatMeta,
  createChat as createChatNative,
  deleteChat as deleteChatNative,
  updateChatMeta as updateChatMetaNative,
  loadMessages as loadMessagesNative,
  clearChat as clearChatNative,
  loadProjectMeta as loadProjectMetaNative,
} from "./useChatPersistence";

const chatCache = new Map<string, ChatMessage[]>();

export function useProjectChats(projectId: string | undefined) {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [chatExecutionIds, setChatExecutionIds] = useState<Map<string, string>>(new Map());
  const loadMetaCountRef = useRef(0);
  const loadChatsCountRef = useRef(0);

  const loadMeta = useCallback(async () => {
    if (!projectId) return;
    const currentLoad = ++loadMetaCountRef.current;
    const meta = await loadProjectMetaNative(projectId);
    if (currentLoad !== loadMetaCountRef.current) return;
    setProjectMeta(meta);
  }, [projectId]);

  const loadChats = useCallback(async () => {
    if (!projectId) {
      setChats([]);
      return;
    }
    const currentLoad = ++loadChatsCountRef.current;
    setIsLoading(true);
    const metas = await listChatMeta(projectId);
    if (currentLoad !== loadChatsCountRef.current) return;
    setChats(metas);
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      loadMeta();
      loadChats();
    }
  }, [projectId, loadMeta, loadChats]);

  const createChat = useCallback(async (): Promise<ChatMeta> => {
    if (!projectId) throw new Error("No project ID");
    const chat = await createChatNative(projectId);
    setChats((prev) => [chat, ...prev]);
    return chat;
  }, [projectId]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!projectId) return;
    await deleteChatNative(projectId, chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    chatCache.delete(chatId);
  }, [projectId]);

  const renameChat = useCallback(async (chatId: string, name: string) => {
    if (!projectId) return;
    const now = Date.now();
    await updateChatMetaNative(projectId, chatId, { name, updatedAt: now });
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, name, updatedAt: now } : c))
    );
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

  const setChatDraft = useCallback(async (chatId: string, draft: string) => {
    if (!projectId) return;
    await updateChatMetaNative(projectId, chatId, { draft, updatedAt: Date.now() });
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, draft, updatedAt: Date.now() } : c))
    );
  }, [projectId]);

  const refreshChats = useCallback(async () => {
    if (!projectId) return [];
    const metas = await listChatMeta(projectId);
    setChats(metas);
    return metas;
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
    const now = Date.now();
    await updateChatMetaNative(projectId, chatId, updates);
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, ...updates, updatedAt: now } : c))
    );
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
    setChatDraft,
    refreshChats,
    setProjectMeta,
    loadMeta,
    setChatExecutionId,
    updateChatMeta,
  };
}
