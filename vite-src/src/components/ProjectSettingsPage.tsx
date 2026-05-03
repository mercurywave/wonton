import { useState, useRef, useEffect } from "react";
import { Folder, ArrowLeft, Trash2 } from "lucide-react";
import { Project } from "../types/project";
import styles from "../components/ProjectSettingsPage.module.css";

interface ProjectSettingsPageProps {
  project: Project | undefined;
  onBack: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export default function ProjectSettingsPage({
  project,
  onBack,
  onRename,
  onDelete,
}: ProjectSettingsPageProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!project) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.error}>Project not found.</div>
        </div>
      </div>
    );
  }

  const handleRenameSubmit = () => {
    if (editValue.trim()) {
      onRename(project.id, editValue.trim());
    }
    setEditing(false);
    setEditValue("");
  };

  const handleDelete = () => {
    onDelete(project.id);
    setDeleteConfirm(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setEditing(false);
      setEditValue("");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <button className={styles.backButton} onClick={onBack}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>

        <div className={styles.header}>
          <Folder size={20} />
          <h2>Project Settings</h2>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="projectName">Project Name</label>
            {editing ? (
              <input
                ref={inputRef}
                id="projectName"
                className={styles.input}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={handleKeyDown}
              />
            ) : (
              <div className={styles.nameRow}>
                <span className={styles.nameValue}>{project.name}</span>
                {project.id !== "default" && (
                  <button
                    className={styles.editNameBtn}
                    onClick={() => {
                      setEditValue(project.name);
                      setEditing(true);
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
            )}
          </div>

          <div className={styles.field}>
            <label>Created</label>
            <span className={styles.value}>
              {new Date(project.createdAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>

          {project.id !== "default" && (
            <div className={styles.dangerZone}>
              <h3>Danger Zone</h3>
              <div className={styles.dangerRow}>
                <div>
                  <span className={styles.dangerLabel}>Delete Project</span>
                  <p className={styles.dangerDesc}>
                    This action cannot be undone. All chats in this project will be lost.
                  </p>
                </div>
                {deleteConfirm ? (
                  <div className={styles.confirmRow}>
                    <button
                      className={`${styles.dangerBtn} ${styles.confirmDelete}`}
                      onClick={handleDelete}
                    >
                      Confirm Delete
                    </button>
                    <button
                      className={styles.cancelBtn}
                      onClick={() => setDeleteConfirm(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    className={styles.dangerBtn}
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
