import { useState, useCallback, useEffect, useRef } from "react";
import { Page } from "./types/chat";
import { isBackendConnected } from "./utils/platformUtils";
import { useProjects } from "./contexts";
import { useChats } from "./contexts";
import { useUI } from "./contexts";
import { useNav } from "./contexts";
import { useEventBus } from "./contexts";
import { FilePermissionsProvider } from "./contexts";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import ProjectsPage from "./components/ProjectsPage";
import ProjectSettingsPage from "./components/ProjectSettingsPage";
import ChatHistoryPage from "./components/ChatHistoryPage";
import WorkflowsPage from "./components/WorkflowsPage";
import StatsPage from "./components/StatsPage";
import TasksPage from "./components/TasksPage";
import BatchesPage from "./components/BatchesPage.tsx";
import ReferencesPage from "./components/ReferencesPage";
import SplitPanel from "./components/SplitPanel";
import "./App.css";
import FileViewerPanel from "./components/FileViewerPanel";
import LoadingScreen from "./components/LoadingScreen";

function App() {
  const {
    projects,
    createProject,
    createProjectFromFolder,
    updateProjectFolder,
    updateProject,
    deleteProject,
    getProjectById,
  } = useProjects();
  const { messages, isLoading, getIsProcessing, sendMessage, stopGeneration, setSelectedChatId, createChat, deleteChat, renameChat, chats, selectedChatId } = useChats();
  const { sidebarOpen, isMobile } = useUI();
  const { on: onEvent } = useEventBus();
  const {
    state: nav,
    activeProjectId,
    isLoading: navIsLoading,
    navigateToProject,
    navigateToChat,
    navigateToNewChat,
    navigateToDeleteChat,
    navigateToRenameChat,
    navigateToPage,
  } = useNav();

  // Local state for project settings sub-page
  const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

  // Temp file viewer state
  const [selectedTempFile, setSelectedTempFile] = useState<string | null>(null);

  // Track pending nav actions that require both NavContext and ChatsContext
  const pendingNavRef = useRef<{ type: string; chatId?: string; name?: string } | null>(null);
  const [pendingTick, setPendingTick] = useState(0);

  // Bridge NavContext actions to ChatsContext operations
  useEffect(() => {
    const pending = pendingNavRef.current;
    if (!pending) return;
    pendingNavRef.current = null;

    (async () => {
      try {
        if (pending.type === "NEW_CHAT_REQUESTED") {
          const chat = await createChat();
          navigateToChat(chat.id);
        } else if (pending.type === "CHAT_DELETE_REQUESTED" && pending.chatId) {
          await deleteChat(pending.chatId);
        } else if (pending.type === "CHAT_RENAME_REQUESTED" && pending.chatId) {
          await renameChat(pending.chatId, pending.name!);
        }
      } catch (err) {
        console.error("Nav operation failed:", err);
      }
    })();
  }, [pendingTick, createChat, deleteChat, renameChat, navigateToChat]);

  // Override nav actions that need ChatsContext to use the pending ref pattern
  const handleNewChat = useCallback(async () => {
    pendingNavRef.current = { type: "NEW_CHAT_REQUESTED" };
    setPendingTick(t => t + 1);
    await navigateToNewChat();
  }, [navigateToNewChat]);

  const handleDeleteChat = useCallback(async (chatId: string) => {
    pendingNavRef.current = { type: "CHAT_DELETE_REQUESTED", chatId };
    setPendingTick(t => t + 1);
    await navigateToDeleteChat(chatId);
  }, [navigateToDeleteChat]);

  const handleRenameChatNav = useCallback(async (chatId: string, name: string) => {
    pendingNavRef.current = { type: "CHAT_RENAME_REQUESTED", chatId, name };
    setPendingTick(t => t + 1);
    await navigateToRenameChat(chatId, name);
  }, [navigateToRenameChat]);

  // Sync nav state ↔ chats context
  useEffect(() => {
    if (nav.chatId !== null) {
      setSelectedChatId(nav.chatId);
    }
  }, [nav.chatId, setSelectedChatId]);

  const selectedChat = chats.find((c) => c.id === selectedChatId);
  const settingsProject = projectSettingsId ? getProjectById(projectSettingsId) : undefined;

  const handleNewProject = useCallback(async () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    await createProject(`Project ${dateStr}`);
  }, [createProject]);

  const handleCreateProjectFromFolder = useCallback(async () => {
    if (!isBackendConnected()) return;
    try {
      const result = await window.electronAPI.os.showFolderDialog("Select Project Folder");
      if (result) {
        await createProjectFromFolder(result);
      }
    } catch (err) {
      console.error("handleCreateProjectFromFolder: failed to show folder dialog", err);
    }
  }, [createProjectFromFolder]);

  const handleLinkFolder = useCallback(async (id: string) => {
    if (!isBackendConnected()) return;
    try {
      const result = await window.electronAPI.os.showFolderDialog("Select Folder for Project");
      if (result) {
        await updateProjectFolder(id, result);
      }
    } catch (err) {
      console.error("handleLinkFolder: failed to show folder dialog", err);
    }
  }, [updateProjectFolder]);

  const handleChangeFolder = useCallback(async (id: string) => {
    if (!isBackendConnected()) return;
    try {
      const result = await window.electronAPI.os.showFolderDialog("Select New Folder for Project");
      if (result) {
        await updateProjectFolder(id, result);
      }
    } catch (err) {
      console.error("handleChangeFolder: failed to show folder dialog", err);
    }
  }, [updateProjectFolder]);

  const handleOpenFolder = useCallback(async (folderPath: string) => {
    if (!isBackendConnected()) return;
    try {
      await window.electronAPI.os.open(folderPath);
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
      navigateToProject("default");
    }
  }, [deleteProject, activeProjectId, navigateToProject]);

  const handleNavigateToProjectSettings = useCallback((id: string) => {
    setProjectSettingsId(id);
    navigateToPage("projectSettings" as Page);
  }, [navigateToPage]);

  useEffect(() => {
    return onEvent("requestOpenFile", (payload: unknown) => {
      const { uniqueName } = payload as { uniqueName: string };
      setSelectedTempFile(uniqueName);
    });
  }, [onEvent, setSelectedTempFile]);

  useEffect(() => {
    return onEvent("navigateToChat", (payload: unknown) => {
      const { chatId } = payload as { chatId: string };
      navigateToChat(chatId);
    });
  }, [onEvent, navigateToChat]);

  const showProjectFeatures = isBackendConnected() && projects.length > 0;

  const chatPanelProps = {
    messages,
    isLoading,
    isProcessing: selectedChatId ? getIsProcessing(selectedChatId) : false,
    onSend: sendMessage,
    onStop: stopGeneration,
    onFileSelect: (uniqueName: string) => {
      setSelectedTempFile(uniqueName);
    },
    tempFileOptions: selectedChat?.reservedTempFiles,
    activeTempFileUniqueName: selectedTempFile,
  };

  if (navIsLoading) {
    return <LoadingScreen />;
  }

  return (
    <div className="app">
      <Sidebar
        onNewChat={handleNewChat}
        showProjectFeatures={showProjectFeatures}
        onProjectSelect={navigateToProject}
        onChatSelect={(chatId) => navigateToChat(chatId)}
        onRenameChat={handleRenameChatNav}
        onDeleteChat={handleDeleteChat}
      />
      <div className={`main ${isMobile ? "" : sidebarOpen ? "expanded" : ""}`}>
        {nav.page === "chat" && selectedTempFile && (
          <SplitPanel
            leftChild={
              <div className="chatPanelWrapper">
              <ChatPanel {...chatPanelProps} />
              </div>
            }
            rightChild={
              <FileViewerPanel
                uniqueName={selectedTempFile}
                reservedTempFiles={selectedChat?.reservedTempFiles || []}
                projectId={activeProjectId || ""}
                onClose={() => setSelectedTempFile(null)}
              />
            }
            initialRatio={0.5}
            leftMinWidth={300}
            rightMinWidth={250}
          />
        )}
        {nav.page === "chat" && !selectedTempFile && (
          <div className="chatPanelWrapper">
          <ChatPanel {...chatPanelProps} />
          </div>
        )}
        {nav.page === "settings" && (
          <FilePermissionsProvider projectId={activeProjectId}>
            <Settings onFolderChange={handleChangeFolder} />
          </FilePermissionsProvider>
        )}
        {nav.page === "projects" && !projectSettingsId && (
          <ProjectsPage
            onProjectSelect={navigateToProject}
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
        {nav.page === "projectSettings" && settingsProject && (
          <ProjectSettingsPage
            project={settingsProject}
            onBack={() => navigateToPage("projects" as Page)}
            onRename={handleRenameProject}
            onDelete={handleDeleteProject}
          />
        )}
        {nav.page === "history" && (
          <ChatHistoryPage
            onChatSelect={(chatId) => navigateToChat(chatId)}
          />
        )}
        {nav.page === "workflows" && (
          <WorkflowsPage />
        )}
        {nav.page === "stats" && (
          <StatsPage />
        )}
        {nav.page === "batches" && (
          <BatchesPage />
        )}
        {nav.page === "tasks" && (
          <TasksPage />
        )}
        {nav.page === "references" && (
          <ReferencesPage />
        )}
      </div>
    </div>
  );
}

export default App;
