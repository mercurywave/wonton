import { useState, useEffect, useCallback } from "react";
import { Page } from "./types/chat";
import { useChatSettings } from "./hooks/useChatSettings";
import { useChatApi } from "./hooks/useChatApi";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import "./App.css";

const MOBILE_BREAKPOINT = 768;

function App() {
  const [settings, updateSettings] = useChatSettings();
  const { messages, isLoading, sendMessage, clearChat, stopGeneration } = useChatApi(settings);
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNewChat = () => {
    clearChat();
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
          />
        )}
        {currentPage === "settings" && (
          <Settings settings={settings} onUpdate={updateSettings} />
        )}
      </div>
    </div>
  );
}

export default App;
