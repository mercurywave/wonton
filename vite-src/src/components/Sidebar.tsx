import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import styles from "../components/Sidebar.module.css";
import { Page } from "../types/chat";
import ProjectSelector from "../components/ProjectSelector";

interface ChatItem {
  id: string;
  name: string;
  updatedAt: number;
  draft?: string;
}

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onOverlayClick: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onNewChat: () => void;
  currentProjectId: string;
  projectCount: number;
  onProjectSelect: (projectId: string) => void;
  showProjectFeatures: boolean;
  projectsLoading: boolean;
  projects: import("../types/project").Project[];
  chats?: ChatItem[];
  activeChatId?: string | null;
  onChatSelect?: (chat: ChatItem) => void;
  onRenameChat?: (chatId: string, name: string) => void;
  onDeleteChat?: (chatId: string) => void;
}

export default function Sidebar({
  isOpen,
  onToggle,
  onOverlayClick,
  currentPage,
  onNavigate,
  onNewChat,
  currentProjectId,
  projectCount,
  onProjectSelect,
  showProjectFeatures,
  projectsLoading,
  projects,
  chats = [],
  activeChatId = null,
  onChatSelect,
  onRenameChat,
  onDeleteChat,
}: SidebarProps) {
  const navItems: { page: Page; icon: React.ReactNode; label: string; filterOut?: () => boolean }[] = [
    { page: "chat", icon: <MessageSquare size={18} />, label: "Chat", filterOut: () => isOpen },
    { page: "projects", icon: <Folder size={18} />, label: "Projects" },
    { page: "history", icon: <Clock size={18} />, label: "History" },
    { page: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const displayChats = chats.slice(0, 5);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  return (
    <>
      <button
        className={styles.mobileToggle}
        onClick={onToggle}
        title="Toggle sidebar"
      >
        <Menu size={18} />
      </button>
      <div
        className={`${styles.overlay} ${isOpen ? styles.overlayVisible : ""}`}
        onClick={onOverlayClick}
      />
      <div
        className={`${styles.sidebar} ${isOpen ? styles.open : ""}`}
      >
        <div className={styles.header}>
          <button className={styles.toggle} onClick={onToggle} title="Toggle sidebar">
            <Menu size={18} />
          </button>
          <span className={styles.title}>Wonton</span>
          <img
            className={`${styles.logo} ${isOpen ? styles.visible : ""}`}
            src="/takeout.svg"
            alt="Takeout"
          />
        </div>

        {isOpen && showProjectFeatures && !projectsLoading && (
          <div className={styles.projectSection}>
            <ProjectSelector
              projects={projects}
              activeProjectId={currentProjectId}
              onProjectSelect={onProjectSelect}
              isOpen={isOpen}
            />
          </div>
        )}

        {!isOpen && (
          <div className={styles.chatActions}>
            <button className={styles.action} onClick={onNewChat} title="New chat">
              <Plus size={16} />
              <span>New Chat</span>
            </button>
          </div>
        )}

        {isOpen && chats.length > 0 && (
          <div className={styles.chatListSection}>
            <div className={styles.chatListHeader}>
              <span className={styles.chatListTitle}>Chats</span>
              <button
                className={styles.newChatBtn}
                onClick={onNewChat}
                title="New chat"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className={styles.chatList}>
              {displayChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`${styles.chatItem} ${chat.id === activeChatId ? styles.active : ""}`}
                  onClick={() => {
                    setContextMenu(null);
                    onChatSelect?.(chat);
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
                      <MessageSquare size={14} className={styles.chatIcon} />
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

        <nav className={styles.nav}>
          {navItems.filter(item => !item.filterOut?.()).map((item) => (
            <button
              key={item.page}
              className={`${styles.navItem} ${currentPage === item.page ? styles.active : ""}`}
              onClick={() => onNavigate(item.page)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className={styles.footer}>
          <img
            className={`${styles.logo} ${!isOpen ? styles.visible : ""}`}
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
