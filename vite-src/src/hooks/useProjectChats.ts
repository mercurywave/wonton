import { useState, useEffect, useCallback, useRef } from "react";
import { ChatMeta, ProjectMeta, ChatMessage } from "../types/chat";
import {
  listChatMeta,
  createChat as createChatNative,
  deleteChat as deleteChatNative,
  updateChatMeta as updateChatMetaNative,
  loadMessages as loadMessagesNative,
  clearChat as clearChatNative,
  loadProjectMeta as loadProjectMetaNative,
  updateProjectMeta as updateProjectMetaNative,
} from "./useChatPersistence";

const chatCache = new Map<string, ChatMessage[]>();

export function useProjectChats(projectId: string | undefined, projectsInitialized?: boolean) {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [processingChatIds, setProcessingChatIds] = useState<Set<string>>(new Set());
  const skipMetaRef = useRef(false);

  const loadMeta = useCallback(async () => {
    if (!projectId) return;
    const meta = await loadProjectMetaNative(projectId);
    setProjectMeta(meta);
    if (meta.activeChatId) {
      setActiveChatId(meta.activeChatId);
    }
  }, [projectId]);

  const loadChats = useCallback(async () => {
    if (!projectId) {
      setChats([]);
      return;
    }
    setIsLoading(true);
    const metas = await listChatMeta(projectId);
    setChats(metas);
    setIsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (skipMetaRef.current) {
      skipMetaRef.current = false;
      return;
    }
    if (projectId && projectsInitialized !== false) {
      loadMeta();
      loadChats();
    }
  }, [projectId, projectsInitialized, loadMeta, loadChats]);

  const createChat = useCallback(async () => {
    if (!projectId) return;
    const chat = await createChatNative(projectId);
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
    skipMetaRef.current = true;
    await loadMeta();
  }, [projectId, loadMeta]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!projectId) return;
    await deleteChatNative(projectId, chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    chatCache.delete(chatId);
    if (activeChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      if (remaining.length > 0) {
        setActiveChatId(remaining[0].id);
        skipMetaRef.current = true;
        await updateProjectMetaNative(projectId, { activeChatId: remaining[0].id });
      } else {
        setActiveChatId(null);
      }
    }
  }, [projectId, activeChatId, chats]);

  const renameChat = useCallback(async (chatId: string, name: string) => {
    if (!projectId) return;
    await updateChatMetaNative(projectId, chatId, { name, updatedAt: Date.now() });
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, name, updatedAt: Date.now() } : c))
    );
  }, [projectId]);

  const setChatActive = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

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
    if (!projectId) return;
    const metas = await listChatMeta(projectId);
    setChats(metas);
  }, [projectId]);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const setChatProcessing = useCallback((chatId: string, processing: boolean) => {
    setProcessingChatIds((prev) => {
      const next = new Set(prev);
      if (processing) {
        next.add(chatId);
      } else {
        next.delete(chatId);
      }
      return next;
    });
  }, []);

  return {
    chats,
    activeChatId,
    activeChat,
    projectMeta,
    isLoading,
    processingChatIds,
    createChat,
    deleteChat,
    renameChat,
    setActiveChat: setChatActive,
    loadChatMessages,
    clearChatMessages,
    setChatDraft,
    refreshChats,
    setProjectMeta,
    loadMeta,
    setChatProcessing,
  };
}
