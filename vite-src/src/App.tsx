import { useState, useEffect, useCallback, useMemo } from "react";
import { Page } from "./types/chat";
import { useChatSettings } from "./hooks/useChatSettings";
import { useChatApi } from "./hooks/useChatApi";
import { useServerModels } from "./hooks/useServerModels";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import "./App.css";

const MOBILE_BREAKPOINT = 768;

function App() {
  const [settings, updateSettings] = useChatSettings();
  const { models, isLoading: modelsLoading, error: modelsError, refetch: refetchModels } = useServerModels(
    settings.serverUrl,
    settings.apiKey
  );
  const { messages, isLoading, sendMessage, clearChat, stopGeneration } = useChatApi(
    settings
  );
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [perChatModel, setPerChatModel] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const visibleModels = useMemo(
    () => models.filter((m) => !settings.hiddenModels.includes(m.id)),
    [models, settings.hiddenModels]
  );

  const activeModel = perChatModel ?? settings.defaultModel;

  const handleNewChat = () => {
    clearChat();
    setPerChatModel(null);
    setCurrentPage("chat");
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleClearChat = () => {
    clearChat();
  };

  const handleNavigate = useCallback(
    (page: Page) => {
      setCurrentPage(page);
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile]
  );

  return (
    <div className="app">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onOverlayClick={() => setSidebarOpen(false)}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onNewChat={handleNewChat}
        onClearChat={handleClearChat}
        messageCount={messages.length}
      />
      <div className={`main ${isMobile ? "" : sidebarOpen ? "expanded" : ""}`}>
        {currentPage === "chat" && (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            onSend={sendMessage}
            onStop={stopGeneration}
            models={visibleModels}
            activeModel={activeModel}
            onModelChange={setPerChatModel}
          />
        )}
        {currentPage === "settings" && (
          <Settings
            settings={settings}
            onUpdate={updateSettings}
            models={visibleModels}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            onRefetch={refetchModels}
          />
        )}
      </div>
    </div>
  );
}

export default App;
