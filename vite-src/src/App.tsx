import { useState, useCallback, useEffect } from "react";
import { ChatMeta } from "./types/chat";
import { updateChatMeta as updateChatMetaNative } from "./hooks/useChatPersistence";
import { isNeutralinoConnected } from "./utils/neuUtils";
import { useSettings, useProjects, useChats, useUI } from "./contexts";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import ProjectsPage from "./components/ProjectsPage";
import ProjectSettingsPage from "./components/ProjectSettingsPage";
import ChatHistoryPage from "./components/ChatHistoryPage";
import "./App.css";
import { os } from "@neutralinojs/lib";

function App() {
  const {
    settings,
  } = useSettings();

  const {
    projects,
    activeProjectId,
    setActiveProjectId,
    getProjectById,
    createProject,
    createProjectFromFolder,
    updateProjectFolder,
    updateProject,
    deleteProject,
  } = useProjects();

  const {
    chats,
    activeChatId,
    activeChat,
    messages,
    isLoading,
    chatExecutionIds,
    createChat,
    deleteChat,
    renameChat,
    setActiveChat,
    refreshChats,
    sendMessage,
    stopGeneration,
  } = useChats();

  const {
    currentPage,
    setCurrentPage,
    sidebarOpen,
    setSidebarOpen,
    isMobile,
  } = useUI();

  const [perChatModel, setPerChatModel] = useState<string | null>(null);
  const [perChatAgent, setPerChatAgent] = useState<string | null>(null);
  const [restoredProject, setRestoredProject] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

  const activeAgentId = perChatAgent || "builtin:default";

  useEffect(() => {
    if (projects.length > 0 && !restoredProject) {
      setRestoredProject(true);
      const hasDefault = projects.some((p) => p.id === "default");
      const lastId = settings.lastProjectId;
      if (lastId && lastId !== "default" && projects.some((p) => p.id === lastId)) {
        setActiveProjectId(lastId);
      } else if (hasDefault) {
        setActiveProjectId("default");
      }
    }
  }, [projects, restoredProject, settings.lastProjectId, setActiveProjectId]);

  useEffect(() => {
    if (activeChat?.activeModel !== undefined) {
      setPerChatModel(activeChat.activeModel || null);
    }
    if (activeChat?.activeAgentId !== undefined) {
      setPerChatAgent(activeChat.activeAgentId || null);
    }
  }, [activeChat?.id, activeChat?.activeModel, activeChat?.activeAgentId]);

  const activeModel = perChatModel ?? settings.defaultModel;

  const settingsProject = projectSettingsId ? getProjectById(projectSettingsId) : undefined;

  const handleNewChat = useCallback(async () => {
    await createChat();
    setCurrentPage("chat");
    setPerChatAgent(null);
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [createChat, isMobile, setCurrentPage, setSidebarOpen]);

  const handleModelChange = useCallback(async (modelId: string) => {
    setPerChatModel(modelId);
    if (activeChatId && isNeutralinoConnected()) {
      if (modelId === settings.defaultModel) {
        await updateChatMetaNative(activeProjectId, activeChatId, { activeModel: undefined });
      } else {
        await updateChatMetaNative(activeProjectId, activeChatId, { activeModel: modelId });
      }
      await refreshChats();
    }
  }, [activeChatId, activeProjectId, settings.defaultModel, refreshChats]);

  const handleAgentChange = useCallback(async (agentId: string) => {
    setPerChatAgent(agentId);
    if (activeChatId && isNeutralinoConnected()) {
      if (agentId === "builtin:default") {
        await updateChatMetaNative(activeProjectId, activeChatId, { activeAgentId: undefined });
      } else {
        await updateChatMetaNative(activeProjectId, activeChatId, { activeAgentId: agentId });
      }
      await refreshChats();
    }
  }, [activeChatId, activeProjectId, refreshChats]);

  const handleChatSelect = useCallback((chat: ChatMeta) => {
    setActiveChat(chat.id);
    setCurrentPage("chat");
    setPerChatModel(chat.activeModel || null);
    setPerChatAgent(chat.activeAgentId || null);
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [setActiveChat, setCurrentPage, setPerChatModel, setPerChatAgent, isMobile, setSidebarOpen]);

  const handleProjectSelect = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentPage("chat");
    setProjectSettingsId(null);
  }, [setActiveProjectId, setCurrentPage]);

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
  }, [setCurrentPage]);

  const showProjectFeatures = isNeutralinoConnected() && projects.length > 0;

  return (
    <div className="app">
      <Sidebar
        onNewChat={handleNewChat}
        showProjectFeatures={showProjectFeatures}
        onProjectSelect={handleProjectSelect}
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
            isProcessing={activeChatId ? chatExecutionIds.has(activeChatId) : false}
            onSend={sendMessage}
            onStop={stopGeneration}
            activeModel={activeModel}
            onModelChange={handleModelChange}
            activeAgentId={activeAgentId}
            onAgentChange={handleAgentChange}
            chatName={activeChat?.name}
          />
        )}
        {currentPage === "settings" && (
          <Settings />
        )}
        {currentPage === "projects" && !projectSettingsId && (
          <ProjectsPage
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
