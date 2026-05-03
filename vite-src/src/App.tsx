import { useState, useEffect, useCallback, useMemo } from "react";
import { Page } from "./types/chat";
import { useChatSettings } from "./hooks/useChatSettings";
import { useChatApi } from "./hooks/useChatApi";
import { useServerModels } from "./hooks/useServerModels";
import { isNeutralinoConnected, useProjects } from "./hooks/useProjects";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import ProjectsPage from "./components/ProjectsPage";
import ProjectSettingsPage from "./components/ProjectSettingsPage";
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
  const { projects, isLoading: projectsLoading, getProjectById, createProject, updateProject, deleteProject } = useProjects();
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);
  const [perChatModel, setPerChatModel] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects.find((p) => p.id === "default")?.id ?? "default";
  });
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

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

  const visibleModels = useMemo(
    () => models.filter((m) => !settings.hiddenModels.includes(m.id)),
    [models, settings.hiddenModels]
  );

  const activeModel = perChatModel ?? settings.defaultModel;

  const activeProject = getProjectById(activeProjectId);
  const settingsProject = projectSettingsId ? getProjectById(projectSettingsId) : undefined;

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
        onClearChat={handleClearChat}
        messageCount={messages.length}
        currentProjectId={activeProjectId}
        projectCount={projects.length}
        onProjectSelect={handleProjectSelect}
        showProjectFeatures={showProjectFeatures}
        projectsLoading={projectsLoading}
        projects={projects}
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
        {currentPage === "projects" && !projectSettingsId && (
          <ProjectsPage
            projects={projects}
            activeProjectId={activeProjectId}
            onProjectSelect={handleProjectSelect}
            onNewProject={handleNewProject}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            onNavigateToSettings={handleNavigateToProjectSettings}
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
      </div>
    </div>
  );
}

export default App;
