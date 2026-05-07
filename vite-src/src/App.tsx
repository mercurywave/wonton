import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Page, ChatMeta, ChatMessage } from "./types/chat";
import { useChatSettings } from "./hooks/useChatSettings";
import { useChatApi } from "./hooks/useChatApi";
import { useServerModels } from "./hooks/useServerModels";
import { useProjects } from "./hooks/useProjects";
import { isNeutralinoConnected } from "./utils/neuUtils";
import { useProjectChats } from "./hooks/useProjectChats";
import { filesystem, os } from "@neutralinojs/lib";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import ProjectsPage from "./components/ProjectsPage";
import ProjectSettingsPage from "./components/ProjectSettingsPage";
import ChatHistoryPage from "./components/ChatHistoryPage";
import "./App.css";

const MOBILE_BREAKPOINT = 768;

function App() {
  const [settings, updateSettings] = useChatSettings();
  const { models, isLoading: modelsLoading, error: modelsError, refetch: refetchModels } = useServerModels(
    settings.serverUrl,
    settings.apiKey
  );
  const { projects, isLoading: projectsLoading, getProjectById, createProject, createProjectFromFolder, updateProjectFolder, updateProject, deleteProject } = useProjects();
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [perChatModel, setPerChatModel] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects.find((p) => p.id === "default")?.id ?? "default";
  });
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingHistoryMessages, setIsLoadingHistoryMessages] = useState(false);
  const historyLoadedRef = useRef(false);
  const {
    chats,
    activeChatId,
    activeChat,
    projectMeta,
    createChat,
    deleteChat,
    renameChat,
    setActiveChat,
    loadChatMessages,
  } = useProjectChats(
    isNeutralinoConnected() ? activeProjectId : undefined
  );
  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    settings,
    isNeutralinoConnected() ? activeProjectId : undefined,
    activeChatId || undefined,
    projectMeta || undefined,
    renameChat
  );

  useEffect(() => {
    if (projects.length > 0) {
      const hasDefault = projects.some((p) => p.id === "default");
      if (hasDefault) {
        setActiveProjectId("default");
      }
    }
  }, [projects]);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (currentPage === "history" && !historyLoadedRef.current && isNeutralinoConnected()) {
      historyLoadedRef.current = true;
      const loadAll = async () => {
        setIsLoadingHistoryMessages(true);
        const allMessages: Record<string, ChatMessage[]> = {};
        for (const chat of chats) {
          const msgs = await loadChatMessages(chat.id);
          allMessages[chat.id] = msgs;
        }
        setHistoryMessages(allMessages);
        setIsLoadingHistoryMessages(false);
      };
      loadAll();
    } else if (currentPage !== "history") {
      historyLoadedRef.current = false;
    }
  }, [currentPage, chats, loadChatMessages]);

  const visibleModels = useMemo(
    () => models.filter((m) => !settings.hiddenModels.includes(m.id)),
    [models, settings.hiddenModels]
  );

  const activeModel = perChatModel ?? settings.defaultModel;

  const settingsProject = projectSettingsId ? getProjectById(projectSettingsId) : undefined;

  const handleNewChat = useCallback(async () => {
    await createChat();
    setCurrentPage("chat");
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [createChat, isMobile]);

  const handleChatSelect = useCallback((chat: ChatMeta) => {
    setActiveChat(chat.id);
    setCurrentPage("chat");
    setPerChatModel(chat.activeModel || null);
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [setActiveChat, isMobile]);

  const handleNavigate = useCallback(
    (page: Page) => {
      setCurrentPage(page);
      setProjectSettingsId(null);
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile]
  );

  const handleProjectSelect = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentPage("chat");
    setProjectSettingsId(null);
  }, []);

  const handleNewProject = useCallback(async () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const name = `Project ${dateStr}`;
    await createProject(name);
  }, [createProject]);

  const handleCreateProjectFromFolder = useCallback(async () => {
    if (!isNeutralinoConnected()) return;
    try {
      const result = await os.showFolderDialog("Select Project Folder");
      if (result) {
        await createProjectFromFolder(result);
      }
    } catch (err) {
      console.error("handleCreateProjectFromFolder: failed to show folder dialog", err);
    }
  }, [createProjectFromFolder]);

  const handleLinkFolder = useCallback(async (id: string) => {
    if (!isNeutralinoConnected()) return;
    try {
      const result = await os.showFolderDialog("Select Folder for Project");
      if (result) {
        await updateProjectFolder(id, result);
      }
    } catch (err) {
      console.error("handleLinkFolder: failed to show folder dialog", err);
    }
  }, [updateProjectFolder]);

  const handleChangeFolder = useCallback(async (id: string) => {
    if (!isNeutralinoConnected()) return;
    try {
      const result = await os.showFolderDialog("Select New Folder for Project");
      if (result) {
        await updateProjectFolder(id, result);
      }
    } catch (err) {
      console.error("handleChangeFolder: failed to show folder dialog", err);
    }
  }, [updateProjectFolder]);

  const handleOpenFolder = useCallback(async (folderPath: string) => {
    if (!isNeutralinoConnected()) return;
    try {
      await os.open(folderPath);
    } catch (err) {
      console.error("handleOpenFolder: failed to open folder", err);
    }
  }, []);

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    await updateProject(id, { name });
  }, [updateProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await deleteProject(id);
    if (activeProjectId === id) {
      setActiveProjectId("default");
    }
  }, [deleteProject, activeProjectId]);

  const handleNavigateToProjectSettings = useCallback((id: string) => {
    setProjectSettingsId(id);
    setCurrentPage("projectSettings");
  }, []);

  const showProjectFeatures = isNeutralinoConnected() && projects.length > 0;

  return (
    <div className="app">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onOverlayClick={() => setSidebarOpen(false)}
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onNewChat={handleNewChat}
        currentProjectId={activeProjectId}
        projectCount={projects.length}
        onProjectSelect={handleProjectSelect}
        showProjectFeatures={showProjectFeatures}
        projectsLoading={projectsLoading}
        projects={projects}
        chats={chats.map((c) => ({ id: c.id, name: c.name, updatedAt: c.updatedAt }))}
        activeChatId={activeChatId}
        onChatSelect={(chat) => {
          const fullChat = chats.find((c) => c.id === chat.id);
          if (fullChat) handleChatSelect(fullChat);
        }}
        onRenameChat={renameChat}
        onDeleteChat={deleteChat}
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
            chatName={activeChat?.name}
            settings={settings}
          />
        )}
        {currentPage === "settings" && (
          <Settings
            settings={settings}
            onUpdate={updateSettings}
            models={models}
            modelsLoading={modelsLoading}
            modelsError={modelsError}
            onRefetch={refetchModels}
          />
        )}
        {currentPage === "projects" && !projectSettingsId && (
          <ProjectsPage
            projects={projects}
            activeProjectId={activeProjectId}
            onProjectSelect={handleProjectSelect}
            onCreateProjectFromFolder={handleCreateProjectFromFolder}
            onNewBlankProject={handleNewProject}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            onNavigateToSettings={handleNavigateToProjectSettings}
            onLinkFolder={handleLinkFolder}
            onChangeFolder={handleChangeFolder}
            onOpenFolder={handleOpenFolder}
          />
        )}
        {currentPage === "projectSettings" && settingsProject && (
          <ProjectSettingsPage
            project={settingsProject}
            onBack={() => setCurrentPage("projects")}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
          />
        )}
        {currentPage === "history" && (
          <ChatHistoryPage
            chats={chats}
            messagesByChat={historyMessages}
            isLoadingMessages={isLoadingHistoryMessages}
            onChatSelect={(chatId) => {
              setActiveChat(chatId);
              setCurrentPage("chat");
              if (isMobile) {
                setSidebarOpen(false);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}

export default App;
