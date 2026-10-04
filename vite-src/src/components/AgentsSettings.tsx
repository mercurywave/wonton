import { useState, useMemo } from "react";
import { CircleUser, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import styles from "../components/AgentsSettings.module.css";
import { Agent, ToolPermissionMode } from "../types/chat";
import { BUILTIN_AGENTS } from "../utils/agents";
import { getMainAgents, getAllAgents } from "../hooks/useAgents";
import { useAgentsContext } from "../contexts";
import { getAllToolNames } from "../tools";

const ALL_TOOLS = getAllToolNames().sort();

export default function AgentsSettings() {
  const { customAgents, addAgent, updateAgent, deleteAgent } = useAgentsContext();

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentToolMode, setAgentToolMode] = useState<ToolPermissionMode>("include");
  const [agentSelectedTools, setAgentSelectedTools] = useState<string[]>([]);
  const [agentAllowlist, setAgentAllowlist] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editToolMode, setEditToolMode] = useState<ToolPermissionMode>("include");
  const [editSelectedTools, setEditSelectedTools] = useState<string[]>([]);
  const [editAllowlist, setEditAllowlist] = useState<string[]>([]);

  const allAvailableAgents = useMemo(() => getMainAgents(customAgents), [customAgents]);
  const allAgentsList = useMemo(() => getAllAgents(customAgents), [customAgents]);

  const handleAddAgent = async () => {
    if (!agentName.trim() || !agentPrompt.trim()) return;
    const toolPermissions = agentSelectedTools.length > 0
      ? { mode: agentToolMode, tools: agentSelectedTools }
      : undefined;
    await addAgent(agentName.trim(), agentPrompt.trim(), toolPermissions, undefined, agentAllowlist.length > 0 ? agentAllowlist : undefined);
    setAgentName("");
    setAgentPrompt("");
    setAgentToolMode("include");
    setAgentSelectedTools([]);
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
    
    if (agent.toolPermissions) {
      setEditToolMode(agent.toolPermissions.mode);
      setEditSelectedTools([...agent.toolPermissions.tools]);
    } else {
      // No tool permissions defined - default to empty include list
      setEditToolMode("include");
      setEditSelectedTools([]);
    }
    
    setEditAllowlist(agent.subagentAllowlist || []);
  };

  const handleSaveEdit = async (id: string) => {
    if (!editName.trim() || !editPrompt.trim()) return;
    const toolPermissions = editSelectedTools.length > 0
      ? { mode: editToolMode, tools: editSelectedTools }
      : undefined;
    await updateAgent(id, editName.trim(), editPrompt.trim(), toolPermissions, editAllowlist.length > 0 ? editAllowlist : undefined);
    setEditingAgentId(null);
    setEditName("");
    setEditPrompt("");
    setEditToolMode("include");
    setEditSelectedTools([]);
    setEditAllowlist([]);
  };

  const handleCancelEdit = () => {
    setEditingAgentId(null);
    setEditName("");
    setEditPrompt("");
    setEditToolMode("include");
    setEditSelectedTools([]);
    setEditAllowlist([]);
  };

  const getAgentTools = (agent: Agent): string[] => {
    return agent.toolPermissions?.tools ?? [];
  };

  const getToolModeLabel = (mode: ToolPermissionMode | undefined): string => {
    if (!mode) return "";
    return mode === "include" ? "include" : "exclude";
  };

  return (
    <div className={styles.agentsSection}>
      <label>Agents</label>
      <div className={styles.agentsList}>
        {BUILTIN_AGENTS.map((agent) => (
          <div key={agent.id} className={`${styles.agentCard} ${styles.agentCardBuiltin}`}>
            <div className={styles.agentCardHeader}>
              {agent.main && <CircleUser size={16} className={styles.mainIcon} />}
              <span className={styles.agentName}>{agent.name}</span>
              <div className={styles.badgeGroup}>
                {agent.main && <span className={styles.mainBadge}>Main</span>}
                <span className={styles.builtinBadge}>Built-in</span>
              </div>
            </div>
            <div className={styles.agentPromptPreview}>
              {agent.systemPrompt.length > 120
                ? agent.systemPrompt.slice(0, 120) + "..."
                : agent.systemPrompt}
            </div>
            {(getAgentTools(agent).length > 0 || (agent.subagentAllowlist?.length ?? 0) > 0) && (
              <div className={styles.tagSection}>
                {getAgentTools(agent).length > 0 && (
                  <div className={styles.tagRow}>
                    <span className={styles.tagLabel}>
                      Tools 
                      {agent.toolPermissions && (
                        <span className={styles.modeBadge}>
                          {getToolModeLabel(agent.toolPermissions.mode)}
                        </span>
                      )}
                    </span>
                    {getAgentTools(agent).map((tool) => (
                      <span key={tool} className={`${styles.tagBubble} ${styles.toolTag}`}>{tool}</span>
                    ))}
                  </div>
                )}
                {agent.subagentAllowlist && agent.subagentAllowlist.length > 0 && (
                  <div className={styles.tagRow}>
                    <span className={styles.tagLabel}>Subagents</span>
                    {agent.subagentAllowlist.map((id) => {
                      const subagent = BUILTIN_AGENTS.find((a) => a.id === id);
                      return subagent ? (
                        <span key={id} className={`${styles.tagBubble} ${styles.subagentTag}`}>{subagent.name}</span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            )}
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
                    <label>Tool Permissions</label>
                    <div className={styles.toolPermissionsSection}>
                      <div className={styles.toolModeToggle}>
                        <button
                          className={`${styles.toolModeButton} ${editToolMode === "include" ? styles.active : ""}`}
                          onClick={() => setEditToolMode("include")}
                          type="button"
                        >
                          Include (only these)
                        </button>
                        <button
                          className={`${styles.toolModeButton} ${editToolMode === "exclude" ? styles.active : ""}`}
                          onClick={() => setEditToolMode("exclude")}
                          type="button"
                        >
                          Exclude (all except)
                        </button>
                      </div>
                      <div className={styles.toolCheckboxes}>
                        <span className={styles.toolCheckboxLabel}>Select tools:</span>
                        {ALL_TOOLS.map((tool) => (
                          <label key={tool} className={styles.toolCheckbox}>
                            <input
                              type="checkbox"
                              checked={editSelectedTools.includes(tool)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditSelectedTools([...editSelectedTools, tool]);
                                } else {
                                  setEditSelectedTools(editSelectedTools.filter((t) => t !== tool));
                                }
                              }}
                            />
                            <span>{tool}</span>
                          </label>
                        ))}
                      </div>
                    </div>
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
                    {agent.main && <CircleUser size={16} className={styles.mainIcon} />}
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
                  {(getAgentTools(agent).length > 0 || (agent.subagentAllowlist?.length ?? 0) > 0) && (
                    <div className={styles.tagSection}>
                      {getAgentTools(agent).length > 0 && (
                        <div className={styles.tagRow}>
                          <span className={styles.tagLabel}>
                            Tools
                            {agent.toolPermissions && (
                              <span className={styles.modeBadge}>
                                {getToolModeLabel(agent.toolPermissions.mode)}
                              </span>
                            )}
                          </span>
                          {getAgentTools(agent).map((tool) => (
                            <span key={tool} className={`${styles.tagBubble} ${styles.toolTag}`}>{tool}</span>
                          ))}
                        </div>
                      )}
                      {agent.subagentAllowlist && agent.subagentAllowlist.length > 0 && (
                        <div className={styles.tagRow}>
                          <span className={styles.tagLabel}>Subagents</span>
                          {agent.subagentAllowlist.map((id) => {
                            const subagent = allAgentsList.find((a) => a.id === id);
                            return subagent ? (
                              <span key={id} className={`${styles.tagBubble} ${styles.subagentTag}`}>{subagent.name}</span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  )}
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
            <label>Tool Permissions</label>
            <div className={styles.toolPermissionsSection}>
              <div className={styles.toolModeToggle}>
                <button
                  className={`${styles.toolModeButton} ${agentToolMode === "include" ? styles.active : ""}`}
                  onClick={() => setAgentToolMode("include")}
                  type="button"
                >
                  Include (only these)
                </button>
                <button
                  className={`${styles.toolModeButton} ${agentToolMode === "exclude" ? styles.active : ""}`}
                  onClick={() => setAgentToolMode("exclude")}
                  type="button"
                >
                  Exclude (all except)
                </button>
              </div>
              <div className={styles.toolCheckboxes}>
                <span className={styles.toolCheckboxLabel}>Select tools:</span>
                {ALL_TOOLS.map((tool) => (
                  <label key={tool} className={styles.toolCheckbox}>
                    <input
                      type="checkbox"
                      checked={agentSelectedTools.includes(tool)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAgentSelectedTools([...agentSelectedTools, tool]);
                        } else {
                          setAgentSelectedTools(agentSelectedTools.filter((t) => t !== tool));
                        }
                      }}
                    />
                    <span>{tool}</span>
                  </label>
                ))}
              </div>
            </div>
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
                setAgentToolMode("include");
                setAgentSelectedTools([]);
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
  );
}
