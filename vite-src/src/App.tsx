import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Page, ChatMeta, ChatMessage, Agent, ToolDefinition } from "./types/chat";
import { useChatSettings } from "./hooks/useChatSettings";
import { useChatApi } from "./hooks/useChatApi";
import { updateChatMeta as updateChatMetaNative } from "./hooks/useChatPersistence";
import { useServerModels } from "./hooks/useServerModels";
import { useProjects } from "./hooks/useProjects";
import { isNeutralinoConnected } from "./utils/neuUtils";
import { getAvailableTools } from "./utils/tools";
import { useProjectChats } from "./hooks/useProjectChats";
import { useAgents, getAllAgents, loadAgentsFile } from "./hooks/useAgents";
import { os } from "@neutralinojs/lib";
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
  const { projects, isLoading: projectsLoading, initialized: projectsInitialized, getProjectById, createProject, createProjectFromFolder, updateProjectFolder, updateProject, deleteProject } = useProjects();
  const [customAgents, addAgent, updateAgent, deleteAgent] = useAgents();
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [perChatModel, setPerChatModel] = useState<string | null>(null);
  const [perChatAgent, setPerChatAgent] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects.find((p) => p.id === "default")?.id ?? "default";
  });
  const [restoredProject, setRestoredProject] = useState(false);
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);
  const [historyMessages, setHistoryMessages] = useState<Record<string, ChatMessage[]>>({});
  const [isLoadingHistoryMessages, setIsLoadingHistoryMessages] = useState(false);
  const historyLoadedRef = useRef(false);
  const [allAgents, setAllAgents] = useState<Agent[]>([]);
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
    setChatDraft,
    refreshChats,
  } = useProjectChats(
    isNeutralinoConnected() ? activeProjectId : undefined,
    projectsInitialized
  );

  const activeAgentId = perChatAgent || "builtin:default";

  const activeAgent = useMemo(
    () => allAgents.find((a) => a.id === activeAgentId),
    [allAgents, activeAgentId]
  );

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  const availableTools: ToolDefinition[] = useMemo(
    () => getAvailableTools(activeProject?.folderPath),
    [activeProject?.folderPath]
  );

  const { messages, isLoading, sendMessage, stopGeneration } = useChatApi(
    settings,
    isNeutralinoConnected() ? activeProjectId : undefined,
    activeChatId || undefined,
    projectMeta || undefined,
    activeAgent?.systemPrompt,
    renameChat,
    availableTools,
    activeProject?.folderPath
  );

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
  }, [projects, restoredProject, settings.lastProjectId]);

  useEffect(() => {
    loadAgentsFile().then((custom) => {
      setAllAgents(getAllAgents(custom));
    });
  }, []);

  useEffect(() => {
    if (activeChat?.activeModel !== undefined) {
      setPerChatModel(activeChat.activeModel || null);
    }
    if (activeChat?.activeAgentId !== undefined) {
      setPerChatAgent(activeChat.activeAgentId || null);
    }
  }, [activeChat?.id, activeChat?.activeModel, activeChat?.activeAgentId]);

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
    setPerChatAgent(null);
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [createChat, isMobile]);

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
    updateSettings({ lastProjectId: projectId });
    setCurrentPage("chat");
    setProjectSettingsId(null);
  }, [updateSettings]);

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
        chats={chats.map((c) => ({ id: c.id, name: c.name, updatedAt: c.updatedAt, draft: c.draft }))}
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
              onModelChange={handleModelChange}
              agents={allAgents}
              activeAgentId={activeAgentId}
              onAgentChange={handleAgentChange}
              chatName={activeChat?.name}
              settings={settings}
              projectId={isNeutralinoConnected() ? activeProjectId : undefined}
              chatId={activeChatId || undefined}
              setChatDraft={setChatDraft}
              tools={availableTools}
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
            customAgents={customAgents}
            onAddAgent={addAgent}
            onUpdateAgent={updateAgent}
            onDeleteAgent={deleteAgent}
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
