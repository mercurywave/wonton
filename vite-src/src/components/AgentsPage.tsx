import { useState, useMemo } from "react";
import { CircleUser, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import styles from "../components/AgentsPage.module.css";
import { Agent } from "../types/chat";
import { BUILTIN_AGENTS } from "../utils/agents";
import { getMainAgents } from "../hooks/useAgents";
import { useAgentsContext } from "../contexts";

export default function AgentsPage() {
  const { customAgents, addAgent, updateAgent, deleteAgent } = useAgentsContext();

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentAllowlist, setAgentAllowlist] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editAllowlist, setEditAllowlist] = useState<string[]>([]);

  const allAvailableAgents = useMemo(() => getMainAgents(customAgents), [customAgents]);

  const handleAddAgent = async () => {
    if (!agentName.trim() || !agentPrompt.trim()) return;
    await addAgent({ name: agentName.trim(), systemPrompt: agentPrompt.trim(), main: true, subagentAllowlist: agentAllowlist.length > 0 ? agentAllowlist : undefined });
    setAgentName("");
    setAgentPrompt("");
    setAgentAllowlist([]);
    setShowAddAgent(false);
  };

  const handleDeleteAgent = async (id: string) => {
    await deleteAgent(id);
  };

  const handleStartEdit = (agent: Agent) => {
    setEditingAgentId(agent.id);
    setEditName(agent.name);
    setEditPrompt(agent.systemPrompt);
    setEditAllowlist(agent.subagentAllowlist || []);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || !editPrompt.trim()) return;
    await updateAgent(id, editName.trim(), editPrompt.trim(), editAllowlist.length > 0 ? editAllowlist : undefined);
    setEditingAgentId(null);
    setEditName("");
    setEditPrompt("");
    setEditAllowlist([]);
  };

  const handleCancelEdit = () => {
    setEditingAgentId(null);
    setEditName("");
    setEditPrompt("");
    setEditAllowlist([]);
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <CircleUser size={20} />
          <h2>Agents</h2>
        </div>

        <div className={styles.agentsSection}>
          <label>Agents</label>
          <div className={styles.agentsList}>
            {BUILTIN_AGENTS.map((agent) => (
              <div key={agent.id} className={`${styles.agentCard} ${styles.agentCardBuiltin}`}>
                <div className={styles.agentCardHeader}>
                  <span className={styles.agentName}>{agent.name}</span>
                  <span className={styles.builtinBadge}>Built-in</span>
                </div>
                <div className={styles.agentPromptPreview}>
                  {agent.systemPrompt.length > 120
                    ? agent.systemPrompt.slice(0, 120) + "..."
                    : agent.systemPrompt}
                </div>
              </div>
            ))}
            {customAgents.map((agent) => {
              const isEditing = editingAgentId === agent.id;
              return (
                <div key={agent.id} className={styles.agentCard}>
                  {isEditing ? (
                    <>
                      <div className={styles.agentCardHeader}>
                        <span className={styles.agentName}>Editing Agent</span>
                        <div className={styles.editActions}>
                          <button
                            className={styles.saveEditButton}
                            onClick={() => handleSaveEdit(agent.id)}
                            type="button"
                            title="Save changes"
                            disabled={!editName.trim() || !editPrompt.trim()}
                          >
                            <Save size={14} />
                          </button>
                          <button
                            className={styles.cancelEditButton}
                            onClick={handleCancelEdit}
                            type="button"
                            title="Cancel editing"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                      <div className={styles.editField}>
                        <input
                          type="text"
                          className={styles.input}
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Agent name"
                        />
                      </div>
                      <div className={styles.editField}>
                        <textarea
                          className={styles.textarea}
                          value={editPrompt}
                          onChange={(e) => setEditPrompt(e.target.value)}
                          placeholder="System prompt for this agent"
                          rows={4}
                        />
                      </div>
                      <div className={styles.editField}>
                        <label>Allowed Subagents</label>
                        <div className={styles.allowlistCheckboxes}>
                          {allAvailableAgents.map((a: Agent) => (
                            <label key={a.id} className={styles.allowlistCheckbox}>
                              <input
                                type="checkbox"
                                checked={editAllowlist.includes(a.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditAllowlist([...editAllowlist, a.id]);
                                  } else {
                                    setEditAllowlist(editAllowlist.filter((id) => id !== a.id));
                                  }
                                }}
                              />
                              <span>{a.name}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.agentCardHeader}>
                        <span className={styles.agentName}>{agent.name}</span>
                        <div className={styles.agentActions}>
                          <button
                            className={styles.editAgentButton}
                            onClick={() => handleStartEdit(agent)}
                            type="button"
                            title="Edit agent"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            className={styles.deleteAgentButton}
                            onClick={() => handleDeleteAgent(agent.id)}
                            type="button"
                            title="Delete agent"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className={styles.agentPromptPreview}>
                        {agent.systemPrompt.length > 120
                          ? agent.systemPrompt.slice(0, 120) + "..."
                          : agent.systemPrompt}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {showAddAgent ? (
            <div className={styles.addAgentForm}>
              <div className={styles.addAgentField}>
                <input
                  type="text"
                  className={styles.input}
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Agent name"
                />
              </div>
              <div className={styles.addAgentField}>
                <textarea
                  className={styles.textarea}
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  placeholder="System prompt for this agent"
                  rows={4}
                />
              </div>
              <div className={styles.addAgentField}>
                <label>Allowed Subagents</label>
                <div className={styles.allowlistCheckboxes}>
                  {allAvailableAgents.map((a: Agent) => (
                    <label key={a.id} className={styles.allowlistCheckbox}>
                      <input
                        type="checkbox"
                        checked={agentAllowlist.includes(a.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAgentAllowlist([...agentAllowlist, a.id]);
                          } else {
                            setAgentAllowlist(agentAllowlist.filter((id) => id !== a.id));
                          }
                        }}
                      />
                      <span>{a.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.addAgentActions}>
                <button
                  className={styles.addAgentButton}
                  onClick={handleAddAgent}
                  type="button"
                  disabled={!agentName.trim() || !agentPrompt.trim()}
                >
                  Add Agent
                </button>
                <button
                  className={styles.cancelButton}
                  onClick={() => {
                    setShowAddAgent(false);
                    setAgentName("");
                    setAgentPrompt("");
                    setAgentAllowlist([]);
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.addAgentToggle}
              onClick={() => setShowAddAgent(true)}
              type="button"
            >
              <Plus size={14} />
              <span>Add Agent</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
