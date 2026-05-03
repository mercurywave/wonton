import { useState, useRef, useEffect } from "react";
import { Folder, Plus, Trash2, Pencil } from "lucide-react";
import { Project } from "../types/project";
import styles from "../components/ProjectsPage.module.css";

interface ProjectsPageProps {
  projects: Project[];
  activeProjectId: string;
  onProjectSelect: (projectId: string) => void;
  onNewProject: () => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onNavigateToSettings: (id: string) => void;
}

export default function ProjectsPage({
  projects,
  activeProjectId,
  onProjectSelect,
  onNewProject,
  onRenameProject,
  onDeleteProject,
  onNavigateToSettings,
}: ProjectsPageProps) {
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
          <button className={styles.newButton} onClick={onNewProject}>
            <Plus size={16} />
            New Project
          </button>
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
                    </span>
                  </div>
                  {project.id !== activeProjectId && (
                    <span className={styles.cardBadge}>
                      {project.id === "default" ? "Default" : ""}
                    </span>
                  )}
                </button>
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
