import { useState, useRef, useEffect } from "react";
import { Folder, Plus, Trash2, Pencil, FolderOpen } from "lucide-react";
import { Project } from "../types/project";
import styles from "../components/ProjectsPage.module.css";
import { useProjects } from "../contexts";

interface ProjectsPageProps {
  onProjectSelect: (projectId: string) => void;
  onCreateProjectFromFolder: () => void;
  onNewBlankProject: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onNavigateToSettings: (id: string) => void;
  onLinkFolder: (id: string) => void;
  onChangeFolder: (id: string) => void;
  onOpenFolder: (folderPath: string) => void;
}

export default function ProjectsPage({
  onProjectSelect,
  onCreateProjectFromFolder,
  onNewBlankProject,
  onRenameProject,
  onDeleteProject,
  onNavigateToSettings,
  onLinkFolder,
  onChangeFolder,
  onOpenFolder,
}: ProjectsPageProps) {
  const { projects, activeProjectId } = useProjects();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleRenameSubmit = () => {
    if (editingId && editValue.trim()) {
      onRenameProject(editingId, editValue.trim());
    }
    setEditingId(null);
    setEditValue("");
  };

  const handleDelete = (id: string) => {
    onDeleteProject(id);
    setDeleteConfirmId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditingId(null);
      setEditValue("");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Folder size={20} />
          <h2>Projects</h2>
          <div className={styles.newButtons}>
            <button className={`${styles.newButton} ${styles.primaryButton}`} onClick={onCreateProjectFromFolder}>
              <FolderOpen size={16} />
              Project from Folder
            </button>
            <button className={`${styles.newButton} ${styles.secondaryButton}`} onClick={onNewBlankProject}>
              <Plus size={16} />
              Blank Project
            </button>
          </div>
        </div>

        <div className={styles.list}>
          {projects.map((project) => (
            <div
              key={project.id}
              className={`${styles.card} ${
                project.id === activeProjectId ? styles.cardActive : ""
              }`}
            >
              {editingId === project.id ? (
                <div className={styles.editRow}>
                  <Folder size={16} className={styles.cardIcon} />
                  <input
                    ref={inputRef}
                    className={styles.editInput}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleKeyDown}
                  />
                </div>
              ) : (
                <button
                  className={styles.cardMain}
                  onClick={() => onProjectSelect(project.id)}
                >
                  <Folder size={16} className={styles.cardIcon} />
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName}>{project.name}</span>
                    <span className={styles.cardDate}>
                      {new Date(project.createdAt).toLocaleDateString()}
                      {project.id !== activeProjectId && (
                        <span className={styles.cardBadge}>
                          {project.id === "default" ? " · Default" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              )}

              {editingId !== project.id && (
                <div className={styles.cardSubRow}>
                  {project.folderPath ? (
                    <>
                      <button
                        className={styles.folderLink}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenFolder(project.folderPath!);
                        }}
                        title={project.folderPath}
                      >
                        <FolderOpen size={12} />
                        <span className={styles.folderPath}>{project.folderPath}</span>
                      </button>
                      <button
                        className={styles.folderAction}
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeFolder(project.id);
                        }}
                      >
                        Change
                      </button>
                    </>
                  ) : (
                    <button
                      className={styles.folderAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        onLinkFolder(project.id);
                      }}
                    >
                      Link Folder
                    </button>
                  )}
                </div>
              )}

              {project.id !== "default" && (
                <div className={styles.cardActions}>
                  {editingId === project.id ? (
                    <>
                      <button
                        className={styles.actionBtn}
                        onClick={handleRenameSubmit}
                        title="Save"
                      >
                        Save
                      </button>
                      <button
                        className={styles.actionBtn}
                        onClick={() => {
                          setEditingId(null);
                          setEditValue("");
                        }}
                        title="Cancel"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className={styles.actionBtn}
                        onClick={() => {
                          setEditingId(project.id);
                          setEditValue(project.name);
                        }}
                        title="Rename"
                      >
                        <Pencil size={14} />
                      </button>
                      {deleteConfirmId === project.id ? (
                        <>
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => handleDelete(project.id)}
                            title="Confirm delete"
                          >
                            Delete
                          </button>
                          <button
                            className={styles.actionBtn}
                            onClick={() => setDeleteConfirmId(null)}
                            title="Cancel delete"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className={styles.actionBtn}
                          onClick={() => setDeleteConfirmId(project.id)}
                          title="Delete project"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
