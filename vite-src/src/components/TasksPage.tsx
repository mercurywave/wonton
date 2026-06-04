import { useState, useRef } from "react";
import {
  Flag,
  Trash2,
  MessageSquare,
  Plus,
  ExternalLink,
  Clock,
  CheckCircle2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import styles from "../components/TasksPage.module.css";
import { useTasks } from "../contexts";
import { useNav } from "../contexts";
import { TaskPriority } from "../types/chat";

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

export default function TasksPage() {
  const { tasks, isLoading, createTask, updateTask, deleteTask, createChatAndGraduate } =
    useTasks();
  const { navigateToChat } = useNav();

  const [showNewTask, setShowNewTask] = useState(false);
  const [newText, setNewText] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority | undefined>();
  const [creating, setCreating] = useState(false);
  const [graduatingId, setGraduatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority | undefined>();
  const [updating, setUpdating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeTasks = tasks.filter((t) => !t.graduatedAt);
  const graduatedTasks = tasks.filter((t) => t.graduatedAt);

  const handleCreate = async () => {
    if (!newText.trim()) return;
    setCreating(true);
    await createTask(newText.trim(), newPriority);
    setNewText("");
    setNewPriority(undefined);
    setCreating(false);
    setShowNewTask(false);
  };

  const handleGraduate = async (taskId: string) => {
    setGraduatingId(taskId);
    try {
      await createChatAndGraduate(taskId);
    } finally {
      setGraduatingId(null);
    }
  };

  const handleDelete = async (taskId: string) => {
    setDeletingId(taskId);
    try {
      await deleteTask(taskId);
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (task: typeof tasks[0]) => {
    setEditingId(task.id);
    setEditText(task.text);
    setEditPriority(task.priority);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
    setEditPriority(undefined);
  };

  const handleUpdate = async () => {
    if (!editText.trim() || !editingId) return;
    setUpdating(true);
    await updateTask(editingId, { text: editText.trim(), priority: editPriority });
    cancelEdit();
    setUpdating(false);
  };

  const handleOpenChat = (chatId: string) => {
    navigateToChat(chatId);
  };

  const sortedTasks = [...activeTasks].sort(
    (a, b) =>
      (PRIORITY_ORDER[a.priority || "low"] - PRIORITY_ORDER[b.priority || "low"]) ||
      b.createdAt - a.createdAt
  );

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <Flag size={22} />
            <h2>Tasks</h2>
          </div>
          <div className={styles.loading}>Loading tasks...</div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <Flag size={22} />
          <h2>Tasks</h2>
          <button className={styles.newTaskBtn} onClick={() => setShowNewTask(true)}>
            <Plus size={16} />
            New Task
          </button>
        </div>

        {showNewTask && (
          <div className={styles.newTaskForm}>
            <textarea
              ref={textareaRef}
              className={styles.newTaskTextarea}
              placeholder="Describe the task..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={4}
              autoFocus
            />
            <div className={styles.newTaskMeta}>
              <select
                className={styles.prioritySelect}
                value={newPriority || ""}
                onChange={(e) =>
                  setNewPriority(e.target.value as TaskPriority | undefined)
                }
              >
                <option value="">No priority</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
              <div className={styles.newTaskActions}>
                <button
                  className={styles.cancelBtn}
                  onClick={() => {
                    setShowNewTask(false);
                    setNewText("");
                    setNewPriority(undefined);
                  }}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  className={styles.submitBtn}
                  onClick={handleCreate}
                  disabled={!newText.trim() || creating}
                >
                  {creating ? "Creating..." : "Create Task"}
                </button>
              </div>
            </div>
          </div>
        )}

        {sortedTasks.length === 0 && (
          <div className={styles.noData}>
            {showNewTask ? "Fill in the form above to create a task." : "No active tasks. Click 'New Task' to get started."}
          </div>
        )}

        {sortedTasks.length > 0 && (
          <div className={styles.taskList}>
            {sortedTasks.map((task) => (
              <div
                key={task.id}
                className={`${styles.taskCard} ${task.graduatedAt ? styles.graduated : ""}`}
              >
                <div className={styles.taskCardHeader}>
                  {task.priority && (
                    <span
                      className={styles.priorityBadge}
                      style={{
                        backgroundColor: `${PRIORITY_COLORS[task.priority]}22`,
                        color: PRIORITY_COLORS[task.priority],
                        borderColor: `${PRIORITY_COLORS[task.priority]}44`,
                      }}
                    >
                      <Flag size={11} />
                      {task.priority}
                    </span>
                  )}
                  <span className={styles.taskDate}>
                    <Clock size={11} />
                    {formatDate(task.createdAt)}
                  </span>
                  {task.graduatedAt ? (
                    <span className={styles.graduatedBadge}>
                      <CheckCircle2 size={11} />
                      Graduated
                    </span>
                  ) : (
                    <span className={styles.activeBadge}>Active</span>
                  )}
                </div>

                {editingId === task.id ? (
                  <div className={styles.editTaskForm}>
                    <textarea
                      className={styles.editTaskTextarea}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={4}
                    />
                    <div className={styles.editTaskMeta}>
                      <select
                        className={styles.prioritySelect}
                        value={editPriority || ""}
                        onChange={(e) =>
                          setEditPriority(e.target.value as TaskPriority | undefined)
                        }
                      >
                        <option value="">No priority</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                      <div className={styles.editTaskActions}>
                        <button
                          className={styles.cancelBtn}
                          onClick={cancelEdit}
                          disabled={updating}
                        >
                          Cancel
                        </button>
                        <button
                          className={styles.submitBtn}
                          onClick={handleUpdate}
                          disabled={!editText.trim() || updating}
                        >
                          {updating ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={styles.taskText}>{task.text}</div>
                )}

                <div className={styles.taskActions}>
                  {!task.graduatedAt && (
                    <button
                      className={styles.editBtn}
                      onClick={() => startEdit(task)}
                    >
                      <Pencil size={11} />
                      Edit
                    </button>
                  )}
                  {!task.graduatedAt && (
                    <button
                      className={styles.graduateBtn}
                      onClick={() => handleGraduate(task.id)}
                      disabled={graduatingId === task.id}
                    >
                      {graduatingId === task.id ? "Creating..." : (
                        <>
                          <MessageSquare size={13} />
                          Create Chat
                        </>
                      )}
                    </button>
                  )}
                  {task.chatId && (
                    <button
                      className={styles.openChatBtn}
                      onClick={() => handleOpenChat(task.chatId!)}
                    >
                      <ExternalLink size={13} />
                      Open Chat
                    </button>
                  )}
                  <button
                    className={`${styles.deleteBtn} ${styles.deleteBtnDanger}`}
                    onClick={() => handleDelete(task.id)}
                    disabled={deletingId === task.id}
                  >
                    <Trash2 size={13} />
                    {deletingId === task.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {graduatedTasks.length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>Graduated ({graduatedTasks.length})</h3>
            <div className={styles.taskList}>
              {graduatedTasks.map((task) => (
                <div key={task.id} className={`${styles.taskCard} ${styles.graduated}`}>
                  <div className={styles.taskCardHeader}>
                    {task.priority && (
                      <span
                        className={styles.priorityBadge}
                        style={{
                          backgroundColor: `${PRIORITY_COLORS[task.priority]}22`,
                          color: PRIORITY_COLORS[task.priority],
                          borderColor: `${PRIORITY_COLORS[task.priority]}44`,
                        }}
                      >
                        <Flag size={11} />
                        {task.priority}
                      </span>
                    )}
                    <span className={styles.taskDate}>
                      <Clock size={11} />
                      {formatDate(task.createdAt)}
                    </span>
                    <span className={styles.graduatedBadge}>
                      <CheckCircle2 size={11} />
                      Graduated {formatDate(task.graduatedAt!)}
                    </span>
                  </div>

                  <div className={styles.taskText}>{task.text}</div>

                  <div className={styles.taskActions}>
                    {task.chatId && (
                      <button
                        className={styles.openChatBtn}
                        onClick={() => handleOpenChat(task.chatId!)}
                      >
                        <ExternalLink size={13} />
                        Open Chat
                      </button>
                    )}
                    <button
                      className={`${styles.deleteBtn} ${styles.deleteBtnDanger}`}
                      onClick={() => handleDelete(task.id)}
                      disabled={deletingId === task.id}
                    >
                      <Trash2 size={13} />
                      {deletingId === task.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
