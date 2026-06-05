import { useState, useRef, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Settings,
  Plus,
  Trash2,
  Menu,
  Folder,
  MoreVertical,
  Pencil,
  Clock,
  DraftingCompass,
  Loader2,
  GitBranch,
  BarChart3,
  Flag,
  CircleFadingArrowUp,
  X,
} from "lucide-react";
import styles from "../components/Sidebar.module.css";
import { Page } from "../types/chat";
import { useUI, useProjects, useChats, useTasks } from "../contexts";
import { useNav } from "../contexts";
import ProjectSelector from "../components/ProjectSelector";
import { PRIORITY_COLORS } from "../utils/taskUtils";

interface SidebarProps {
  onNewChat: () => void;
  showProjectFeatures: boolean;
  onProjectSelect: (projectId: string) => void;
  onChatSelect?: (chatId: string) => void;
  onRenameChat?: (chatId: string, name: string) => void;
  onDeleteChat?: (chatId: string) => void;
}

export default function Sidebar({
  onNewChat,
  showProjectFeatures,
  onProjectSelect,
  onChatSelect,
  onRenameChat,
  onDeleteChat,
}: SidebarProps) {
  const { sidebarOpen, setSidebarOpen } = useUI();
  const { projects, isLoading: projectsLoading } = useProjects();
  const { chats, getIsProcessing, selectedChatId } = useChats();
  const { state: nav, activeProjectId, navigateToPage, navigateToChat } = useNav();
  const { getSortedActiveTasks, createChatAndGraduateWithId, createTask } = useTasks();

  const displayChats = chats.slice(0, 5).map((c) => ({
    id: c.id,
    name: c.name,
    updatedAt: c.updatedAt,
    draft: c.draft,
    isProcessing: getIsProcessing(c.id),
  }));

  const sortedActiveTasks = getSortedActiveTasks();
  const displayTasks = sortedActiveTasks.slice(0, 3);
  const navItems: { page: Page; icon: React.ReactNode; label: string; filterOut?: () => boolean }[] = [
    { page: "chat", icon: <MessageSquare size={18} />, label: "Chat", filterOut: () => sidebarOpen },
    { page: "tasks", icon: <Flag size={18} />, label: "Tasks", filterOut: () => sidebarOpen },
    { page: "projects", icon: <Folder size={18} />, label: "Projects" },
    { page: "history", icon: <Clock size={18} />, label: "History", filterOut: () => sidebarOpen },
    { page: "workflows", icon: <GitBranch size={18} />, label: "Workflows" },
    { page: "stats", icon: <BarChart3 size={18} />, label: "Stats" },
    { page: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [showTaskPopup, setShowTaskPopup] = useState(false);
  const [taskPopupText, setTaskPopupText] = useState("");
  const [taskCreating, setTaskCreating] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number } | null>(null);
  const taskPopupRef = useRef<HTMLDivElement>(null);
  const taskInputRef = useRef<HTMLTextAreaElement>(null);
  const taskBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
      if (
        showTaskPopup &&
        taskPopupRef.current &&
        !taskPopupRef.current.contains(e.target as Node)
      ) {
        setShowTaskPopup(false);
        setTaskPopupText("");
        setPopupPosition(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTaskPopup]);

  useEffect(() => {
    if (showTaskPopup) {
      if (taskBtnRef.current) {
        const rect = taskBtnRef.current.getBoundingClientRect();
        const MIN_LEFT = 10;
        const popupWidth = 400;
        let left = rect.left;
        if (left + popupWidth > window.innerWidth - MIN_LEFT) {
          left = window.innerWidth - popupWidth - MIN_LEFT;
        }
        if (left < MIN_LEFT) left = MIN_LEFT;
        setPopupPosition({ top: rect.bottom + 4, left });
      }
      setTimeout(() => taskInputRef.current?.focus(), 0);
    } else {
      setTaskPopupText("");
      setPopupPosition(null);
    }
  }, [showTaskPopup]);

  const handleTaskPopupKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowTaskPopup(false);
      setTaskPopupText("");
    } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      handleTaskPopupSave();
    }
  }, []);

  const handleTaskPopupSave = useCallback(async () => {
    if (!taskPopupText.trim()) return;
    setTaskCreating(true);
    await createTask(taskPopupText.trim());
    setTaskPopupText("");
    setShowTaskPopup(false);
    setTaskCreating(false);
  }, [taskPopupText, createTask]);

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    setContextMenu({ chatId, x: e.clientX, y: e.clientY });
  };

  const handleStartRename = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setRenamingChatId(chatId);
      setRenameValue(chat.name);
      setContextMenu(null);
      setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 0);
    }
  };

  const handleRenameSubmit = () => {
    if (renamingChatId && renameValue.trim()) {
      onRenameChat?.(renamingChatId, renameValue.trim());
    }
    setRenamingChatId(null);
    setRenameValue("");
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenamingChatId(null);
      setRenameValue("");
    }
  };

  const handleTaskClick = async (taskId: string) => {
    const chatId = await createChatAndGraduateWithId(taskId);
    navigateToChat(chatId);
  };

  return (
    <>
      <button
        className={styles.mobileToggle}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>
      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ""}`}
        onClick={() => setSidebarOpen(false)}
      />
      <div
        className={`${styles.sidebar} ${sidebarOpen ? styles.open : ""}`}
      >
        <div className={styles.header}>
          <button className={styles.toggle} onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
            <Menu size={18} />
          </button>
          <span className={styles.title}>Wonton</span>
          <img
            className={`${styles.logo} ${sidebarOpen ? styles.visible : ""}`}
            src="/takeout.svg"
            alt="Takeout"
          />
        </div>

        {sidebarOpen && showProjectFeatures && !projectsLoading && (
          <div className={styles.projectSection}>
            <ProjectSelector
              projects={projects}
              activeProjectId={activeProjectId || undefined}
              onProjectSelect={onProjectSelect}
              isOpen={sidebarOpen}
            />
          </div>
        )}

        {!sidebarOpen && (
          <div className={styles.chatActions}>
            <button className={styles.action} onClick={onNewChat} title="New chat">
              <Plus size={16} />
              <span>New Chat</span>
            </button>
          </div>
        )}

        {sidebarOpen && chats.length > 0 && (
          <div className={styles.chatListSection}>
            <div className={styles.chatListHeader}>
              <button
                className={`${styles.chatListTitle} ${nav.page === "history" ? styles.active : ""}`}
                onClick={() => navigateToPage("history")}
              >
                <MessageSquare size={18} />
                <span className={styles.chatListLabel}>Chats</span>
                <div
                  className={styles.newChatBtnWrapper}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewChat();
                  }}
                  title="New chat"
                >
                  <Plus size={14} />
                </div>
              </button>
            </div>
            <div className={styles.chatList}>
              {displayChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`${styles.chatItem} ${nav.page === "chat" && chat.id === selectedChatId ? styles.active : ""}`}
                  onClick={() => {
                    setContextMenu(null);
                    onChatSelect?.(chat.id);
                  }}
                  onContextMenu={(e) => handleContextMenu(e, chat.id)}
                >
                  {renamingChatId === chat.id ? (
                    <input
                      ref={renameInputRef}
                      className={styles.renameInput}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={handleRenameSubmit}
                      onKeyDown={handleRenameKeyDown}
                    />
                  ) : (
                    <>
                      {chat.isProcessing ? (
                        <Loader2 size={14} className={`${styles.chatIcon} ${styles.spinner}`} />
                      ) : (
                        <MessageSquare size={14} className={styles.chatIcon} />
                      )}
                      <span className={styles.chatName}>{chat.name}</span>
                      {chat.draft ? (
                        <DraftingCompass 
                          size={14} 
                          className={styles.draftIcon} 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, chat.id);
                          }} 
                        />
                      ) : (
                        <button
                          className={styles.chatMoreBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, chat.id);
                          }}
                        >
                          <MoreVertical size={12} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {sidebarOpen && displayTasks.length > 0 && (
          <div className={styles.taskListSection}>
            <div className={styles.taskListHeader}>
              <button
                className={`${styles.taskListTitle} ${nav.page === "tasks" ? styles.active : ""}`}
                onClick={() => navigateToPage("tasks")}
              >
                <Flag size={18} />
                <span className={styles.taskListLabel}>Tasks</span>
                <div
                  ref={taskBtnRef}
                  className={styles.newTaskBtnWrapper}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTaskPopup(true);
                  }}
                  title="New task"
                >
                  <Plus size={14} />
                </div>
              </button>
              {showTaskPopup && popupPosition && (
                <div
                  ref={taskPopupRef}
                  className={styles.taskPopupWrapper}
                  style={{ top: popupPosition.top, left: popupPosition.left }}
                >
                  <div className={styles.taskPopup}>
                    <textarea
                      ref={taskInputRef}
                      className={styles.taskPopupTextarea}
                      placeholder="Describe the task..."
                      value={taskPopupText}
                      onChange={(e) => setTaskPopupText(e.target.value)}
                      onKeyDown={handleTaskPopupKeyDown}
                      rows={3}
                    />
                    <div className={styles.taskPopupActions}>
                      <button
                        className={styles.taskPopupClose}
                        onClick={() => {
                          setShowTaskPopup(false);
                          setTaskPopupText("");
                        }}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                      <button
                        className={styles.taskPopupSave}
                        onClick={handleTaskPopupSave}
                        disabled={!taskPopupText.trim() || taskCreating}
                      >
                        {taskCreating ? "Creating..." : "Create"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={styles.taskList}>
              {displayTasks.map((task) => (
                <div key={task.id} className={styles.taskItem}>
                  {task.priority && (
                    <span
                      className={styles.taskPriorityBadge}
                      style={{
                        backgroundColor: `${PRIORITY_COLORS[task.priority]}22`,
                        color: PRIORITY_COLORS[task.priority],
                      }}
                    >
                      <Flag size={10} />
                    </span>
                  )}
                  <span className={styles.taskName}>{task.text}</span>
                  <button
                    className={styles.taskGraduateBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTaskClick(task.id);
                    }}
                    title="Create chat and graduate"
                  >
                    <CircleFadingArrowUp size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <nav className={styles.nav}>
          {navItems.filter(item => !item.filterOut?.()).map((item) => (
            <button
              key={item.page}
              className={`${styles.navItem} ${nav.page === item.page ? styles.active : ""}`}
              onClick={() => navigateToPage(item.page)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.footer}>
          <img
            className={`${styles.logo} ${!sidebarOpen ? styles.visible : ""}`}
            src="/takeout.svg"
            alt="Takeout"
          />
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className={styles.contextMenuItem}
            onClick={() => handleStartRename(contextMenu.chatId)}
          >
            <Pencil size={14} />
            <span>Rename</span>
          </button>
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuDelete}`}
            onClick={() => {
              onDeleteChat?.(contextMenu.chatId);
              setContextMenu(null);
            }}
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </>
  );
}
