import { MessageSquare, Settings, Plus, Trash2, Menu, Folder } from "lucide-react";
import styles from "../components/Sidebar.module.css";
import { Page } from "../types/chat";
import ProjectSelector from "../components/ProjectSelector";

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  onOverlayClick: () => void;
  currentPage: Page;
  onNavigate: (page: Page) => void;
  onNewChat: () => void;
  onClearChat: () => void;
  messageCount: number;
  currentProjectId: string;
  projectCount: number;
  onProjectSelect: (projectId: string) => void;
  onNewProject: () => void;
  showProjectFeatures: boolean;
  projectsLoading: boolean;
  projects: import("../types/project").Project[];
}

export default function Sidebar({
  isOpen,
  onToggle,
  onOverlayClick,
  currentPage,
  onNavigate,
  onNewChat,
  onClearChat,
  messageCount,
  currentProjectId,
  projectCount,
  onProjectSelect,
  onNewProject,
  showProjectFeatures,
  projectsLoading,
  projects,
}: SidebarProps) {
  const navItems: { page: Page; icon: React.ReactNode; label: string }[] = [
    { page: "chat", icon: <MessageSquare size={18} />, label: "Chat" },
    { page: "projects", icon: <Folder size={18} />, label: "Projects" },
    { page: "settings", icon: <Settings size={18} />, label: "Settings" },
  ];

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

        {showProjectFeatures && !projectsLoading && (
          <div className={styles.projectSection}>
            <ProjectSelector
              projects={projects}
              activeProjectId={currentProjectId}
              onProjectSelect={onProjectSelect}
              onNewProject={onNewProject}
              isOpen={isOpen}
            />
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.action} onClick={onNewChat} title="New chat">
            <Plus size={16} />
            <span>New Chat</span>
          </button>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
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
          {messageCount > 0 && (
            <button className={styles.action} onClick={onClearChat} title="Clear chat">
              <Trash2 size={16} />
              <span>Clear Chat</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
