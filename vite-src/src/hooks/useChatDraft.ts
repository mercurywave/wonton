import { useState, useEffect, useCallback, useRef } from "react";
import { chatStore } from "../store/chats";
import { isNeutralinoConnected } from "../utils/neuUtils";

const DRAFT_SAVE_INTERVAL_MS = 5000;

export function useChatDraft(projectId?: string, chatId?: string, setChatDraft?: (chatId: string, draft: string) => Promise<void>) {
  const [draft, setDraft] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [writeProjectId, setWriteProjectId] = useState<string | undefined>();
  const [writeChatId, setWriteChatId] = useState<string | undefined>();

  // Load draft when chat changes
  useEffect(() => {
    if (!projectId || !chatId) {
      setDraft("");
      return;
    }

    const loadDraft = async () => {
      if (!isNeutralinoConnected()) {
        setDraft("");
        return;
      }

      await chatStore.load(projectId);
      const metas = chatStore.getChatMetas(projectId);
      const chatMeta = metas.find((m) => m.id === chatId);
      setDraft(chatMeta?.draft || "");
      setWriteProjectId(chatMeta?.projectId || projectId);
      setWriteChatId(chatId);
    };

    loadDraft();
  }, [projectId, chatId]);

  // Debounced save to file on interval
  useEffect(() => {
    if (!writeProjectId || !writeChatId || !setChatDraft) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      setChatDraft(writeChatId, draft);
    }, DRAFT_SAVE_INTERVAL_MS);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draft, writeProjectId, writeChatId, setChatDraft]);

  const handleBlur = useCallback(() => {
    if (writeProjectId && writeChatId && setChatDraft) {
      setChatDraft(writeChatId, draft);
    }
  }, [writeProjectId, writeChatId, draft, setChatDraft]);

  const setDraftAndSave = useCallback((value: string) => {
    setDraft(value);
  }, []);

  return {
    draft,
    setDraft: setDraftAndSave,
    handleBlur,
  };
}
