import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Search, MessageSquare } from "lucide-react";
import { ChatMessage, ChatMeta } from "../types/chat";
import styles from "../components/ChatHistoryPage.module.css";
import { useChats, useUI } from "../contexts";

const WORDS_AROUND = 4;
const SEARCH_DEBOUNCE_MS = 200;

interface SearchResult {
  chatId: string;
  quotes: string[];
}

interface ChatHistoryPageProps {
  onChatSelect: (chatId: string) => void;
}

function extractQuoteAroundMatch(content: string, matchIndex: number, queryLength: number): string {
  const lowerContent = content.toLowerCase();
  const matchEnd = matchIndex + queryLength;

  // Extract all words with their positions
  const words: { text: string; start: number; end: number }[] = [];
  let i = 0;
  while (i < lowerContent.length) {
    // Skip whitespace
    while (i < lowerContent.length && /\s/.test(lowerContent[i])) i++;
    if (i >= lowerContent.length) break;
    const wordStartIdx = i;
    while (i < lowerContent.length && !/\s/.test(lowerContent[i])) i++;
    words.push({ text: lowerContent.slice(wordStartIdx, i), start: wordStartIdx, end: i });
  }

  // Find which word index contains the match
  let matchWordIdx = -1;
  for (let w = 0; w < words.length; w++) {
    if (words[w].start <= matchIndex && matchIndex < words[w].end) {
      matchWordIdx = w;
      break;
    }
  }
  if (matchWordIdx === -1) return lowerContent.slice(matchIndex, matchEnd);

  // Collect words: WORDS_AROUND before + match word + WORDS_AROUND after
  const startWord = Math.max(0, matchWordIdx - WORDS_AROUND);
  const endWord = Math.min(words.length, matchWordIdx + WORDS_AROUND + 1);

  const truncatedLeft = startWord > 0;
  const truncatedRight = endWord < words.length;

  let result = words.slice(startWord, endWord).map((w) => w.text).join(" ");
  if (truncatedLeft) result = "..." + result;
  if (truncatedRight) result = result + "...";

  return result;
}

function highlightMatch(text: string, query: string): string {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function buildSearchResults(
  chats: ChatMeta[],
  messagesByChat: Record<string, ChatMessage[]>,
  query: string
): Record<string, SearchResult> {
  if (!query.trim()) return {};

  const results: Record<string, SearchResult> = {};
  const lowerQuery = query.toLowerCase();
  const queryLength = query.length;

  for (const chat of chats) {
    const messages = messagesByChat[chat.id];
    if (!messages || messages.length === 0) continue;

    const quotes: string[] = [];

    for (const msg of messages) {
      if (quotes.length >= 3) break;

      const lowerContent = msg.content.toLowerCase();
      const idx = lowerContent.indexOf(lowerQuery);
      if (idx === -1) continue;

      const quote = extractQuoteAroundMatch(msg.content, idx, queryLength);
      quotes.push(quote);
    }

    if (quotes.length > 0) {
      results[chat.id] = { chatId: chat.id, quotes };
    }
  }

  return results;
}

export default function ChatHistoryPage({
  onChatSelect,
}: ChatHistoryPageProps) {
  const { chats, historyMessages, isLoadingHistoryMessages, loadHistoryMessages } = useChats();
  const { currentPage } = useUI();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (currentPage !== "history") {
      hasLoadedRef.current = false;
      return;
    }
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      loadHistoryMessages();
    }
  }, [currentPage, loadHistoryMessages]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const searchResults = useMemo(
    () => buildSearchResults(chats, historyMessages, debouncedQuery),
    [chats, historyMessages, debouncedQuery]
  );

  const filteredChats = useMemo(() => {
    if (debouncedQuery.trim()) {
      return chats.filter((c) => c.id in searchResults);
    }
    return chats;
  }, [chats, searchResults, debouncedQuery]);

  const getFirstUserMessage = useCallback((chatId: string): string => {
    const messages = historyMessages[chatId];
    if (!messages) return "";
    const userMsg = messages.find((m) => m.role === "user");
    if (!userMsg) return "";
    if (userMsg.content.length > 200) {
      return userMsg.content.slice(0, 200) + "...";
    }
    return userMsg.content;
  }, [historyMessages]);

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <MessageSquare size={20} />
          <h2>Chat History</h2>
        </div>

        <div className={styles.searchWrapper}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search all messages..."
            value={query}
            onChange={handleInputChange}
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => setQuery("")}>
              Clear
            </button>
          )}
        </div>

        {isLoadingHistoryMessages && (
          <div className={styles.loading}>Loading messages...</div>
        )}

        <div className={styles.list}>
          {filteredChats.map((chat) => {
            const result = searchResults[chat.id];
            const firstUserMsg = getFirstUserMessage(chat.id);

            return (
              <button
                key={chat.id}
                className={styles.card}
                onClick={() => onChatSelect(chat.id)}
              >
                <div className={styles.cardMain}>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName}>{chat.name}</span>
                    <span className={styles.cardDate}>
                      {formatDate(chat.createdAt)}
                    </span>
                  </div>
                </div>

                {firstUserMsg && (
                  <div className={styles.preview}>
                    {debouncedQuery.trim() ? (
                      <div
                        className={styles.previewText}
                        dangerouslySetInnerHTML={{
                          __html: highlightMatch(
                            firstUserMsg.toLowerCase(),
                            debouncedQuery
                          ),
                        }}
                      />
                    ) : (
                      <span className={styles.previewText}>{firstUserMsg}</span>
                    )}
                  </div>
                )}

                {result && result.quotes.length > 0 && (
                  <div className={styles.quotes}>
                    {result.quotes.map((quote, i) => (
                      <div key={i} className={styles.quote}>
                        <span className={styles.quoteMarker}>"</span>
                        <span
                          className={styles.quoteText}
                          dangerouslySetInnerHTML={{
                            __html: highlightMatch(quote, debouncedQuery),
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {debouncedQuery.trim() && filteredChats.length === 0 && (
                  <div className={styles.noResults}>
                    No chats found matching "{debouncedQuery}"
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
