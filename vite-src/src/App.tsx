import { useState, useCallback, useEffect, useRef } from "react";
import { Page } from "./types/chat";
import { isNeutralinoConnected } from "./utils/neuUtils";
import { os } from "@neutralinojs/lib";
import { useSettings } from "./contexts";
import { useProjects } from "./contexts";
import { useChats } from "./contexts";
import { useUI } from "./contexts";
import { useNav } from "./contexts";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import Settings from "./components/Settings";
import ProjectsPage from "./components/ProjectsPage";
import ProjectSettingsPage from "./components/ProjectSettingsPage";
import ChatHistoryPage from "./components/ChatHistoryPage";
import "./App.css";

function App() {
  const { settings } = useSettings();
  const {
    projects,
    createProject,
    createProjectFromFolder,
    updateProjectFolder,
    updateProject,
    deleteProject,
    getProjectById,
  } = useProjects();
   const { messages, isLoading, chatExecutionIds, sendMessage, stopGeneration, updateChatMeta, setSelectedChatId, createChat, deleteChat, renameChat, chats, selectedChatId } = useChats();
   const { sidebarOpen, isMobile } = useUI();
   const {
      state: nav,
      activeProjectId,
      navigateToProject,
      navigateToChat,
      navigateToNewChat,
      navigateToDeleteChat,
      navigateToRenameChat,
      navigateToPage,
    } = useNav();

   // Local state for project settings sub-page
   const [projectSettingsId, setProjectSettingsId] = useState<string | null>(null);

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
  const activeAgentId = selectedChat?.activeAgentId || "builtin:default";
  const activeModel = selectedChat?.activeModel ?? settings.defaultModel;
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
      navigateToProject("default");
    }
  }, [deleteProject, activeProjectId, navigateToProject]);

  const handleNavigateToProjectSettings = useCallback((id: string) => {
    setProjectSettingsId(id);
    navigateToPage("projectSettings" as Page);
  }, [navigateToPage]);

  const showProjectFeatures = isNeutralinoConnected() && projects.length > 0;

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
        {nav.page === "chat" && (
          <ChatPanel
            messages={messages}
            isLoading={isLoading}
            isProcessing={selectedChatId ? chatExecutionIds.has(selectedChatId) : false}
            onSend={sendMessage}
            onStop={stopGeneration}
            activeModel={activeModel}
            onModelChange={async (modelId) => {
              if (!selectedChatId || !activeProjectId) return;
              if (modelId !== settings.defaultModel) {
                await updateChatMeta(activeProjectId, selectedChatId, { activeModel: modelId });
              } else {
                await updateChatMeta(activeProjectId, selectedChatId, { activeModel: undefined });
              }
            }}
            activeAgentId={activeAgentId}
            onAgentChange={async (agentId) => {
              if (!selectedChatId || !activeProjectId) return;
              if (agentId !== "builtin:default") {
                await updateChatMeta(activeProjectId, selectedChatId, { activeAgentId: agentId });
              } else {
                await updateChatMeta(activeProjectId, selectedChatId, { activeAgentId: undefined });
              }
            }}
            chatName={selectedChat?.name}
          />
        )}
        {nav.page === "settings" && (
          <Settings />
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
      </div>
    </div>
  );
}

export default App;
