import { useState, useMemo } from "react";
import { Settings as SettingsIcon, Eye, EyeOff, Check, Plus, Trash2, Pencil, Save, X } from "lucide-react";
import styles from "../components/Settings.module.css";
import { ChatSettings as ChatSettingsType } from "../hooks/useChatSettings";
import { Agent } from "../types/chat";
import { BUILTIN_AGENTS } from "../utils/agents";
import { getMainAgents } from "../hooks/useAgents";
import { useSettings, useAgentsContext } from "../contexts";

interface SettingsProps {
  onUpdateProjectSettings?: (updates: Partial<ChatSettingsType>) => void;
}

export default function Settings({ onUpdateProjectSettings }: SettingsProps) {
  const { settings, updateSettings, models, modelsLoading, modelsError, refetchModels } = useSettings();
  const { customAgents, addAgent, updateAgent, deleteAgent } = useAgentsContext();

  const onUpdate = onUpdateProjectSettings || updateSettings;
  const allModels = models;
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentAllowlist, setAgentAllowlist] = useState<string[]>([]);
  const [editName, setEditName] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editAllowlist, setEditAllowlist] = useState<string[]>([]);

  const allAvailableAgents = useMemo(() => getMainAgents(customAgents), [customAgents]);

  const handleToggleDefault = (modelId: string) => {
    onUpdate({ defaultModel: modelId });
  };

  const handleToggleHidden = (modelId: string) => {
    const hidden = settings.hiddenModels.includes(modelId);
    const next = hidden
      ? settings.hiddenModels.filter((id) => id !== modelId)
      : [...settings.hiddenModels, modelId];
    onUpdate({ hiddenModels: next });
    if (settings.defaultModel === modelId) {
      onUpdate({ defaultModel: "" });
    }
  };

  const handleContextChange = (modelId: string, value: string) => {
    const num = parseInt(value);
    const next = { ...settings.contextWindows };
    if (num > 0) {
      next[modelId] = num;
    } else {
      delete next[modelId];
    }
    onUpdate({ contextWindows: next });
  };

  const handleAliasChange = (modelId: string, value: string) => {
    const next = { ...settings.modelAliases };
    if (value.trim()) {
      next[modelId] = value;
    } else {
      delete next[modelId];
    }
    onUpdate({ modelAliases: next });
  };

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
          <SettingsIcon size={20} />
          <h2>Settings</h2>
        </div>

        <div className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="serverUrl">Server URL</label>
            <input
              id="serverUrl"
              type="url"
              className={styles.input}
              value={settings.serverUrl}
              onChange={(e) => onUpdate({ serverUrl: e.target.value })}
              placeholder="https://api.openai.com"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="apiKey">API Key</label>
            <input
              id="apiKey"
              type="password"
              className={styles.input}
              value={settings.apiKey}
              onChange={(e) => onUpdate({ apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="systemPrompt">System Prompt</label>
            <textarea
              id="systemPrompt"
              className={styles.textarea}
              value={settings.systemPrompt}
              onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
              placeholder="You are a helpful assistant."
              rows={4}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="defaultContextWindow">Default Context Window (tokens)</label>
            <input
              id="defaultContextWindow"
              type="number"
              className={styles.input}
              value={settings.defaultContextWindow}
              onChange={(e) => onUpdate({ defaultContextWindow: parseInt(e.target.value) || 0 })}
              placeholder="131072"
              min={1024}
              step={1024}
            />
          </div>

          <div className={styles.modelsSection}>
            <label>Models</label>

            {!settings.serverUrl.trim() && (
              <div className={styles.modelsPrompt}>
                Enter a server URL above to discover available models.
              </div>
            )}

            {settings.serverUrl.trim() && modelsLoading && (
              <div className={styles.modelsLoading}>Loading models...</div>
            )}

            {modelsError && (
              <div className={styles.modelsError}>
                <div className={styles.modelsErrorText}>{modelsError}</div>
                <button
                  className={styles.retryButton}
                  onClick={refetchModels}
                  type="button"
                >
                  Retry
                </button>
              </div>
            )}

            {allModels.length === 0 &&
              !modelsLoading &&
              !modelsError &&
              settings.serverUrl.trim() && (
                <div className={styles.modelsEmpty}>
                  No models available on this server.
                </div>
              )}

            {allModels.length > 0 && (
              <div className={styles.modelsList}>
                {allModels.map((model) => {
                  const isDefault = model.id === settings.defaultModel;
                  const isHidden = settings.hiddenModels.includes(model.id);
                  const customContext = model.id in settings.contextWindows;
                  const contextValue = settings.contextWindows[model.id] ?? "";
                  const aliasValue = settings.modelAliases[model.id] ?? "";

                  return (
                    <div
                      key={model.id}
                      className={`${styles.modelCard} ${isDefault ? styles.modelCardDefault : ""} ${isHidden ? styles.modelCardHidden : ""}`}
                    >
                      <div className={styles.modelCardHeader}>
                        <span className={`${styles.modelId} ${isHidden ? styles.modelIdHidden : ""}`}>{model.id}</span>
                        <button
                          className={`${styles.defaultButton} ${isDefault ? styles.defaultButtonActive : ""} ${isHidden ? styles.defaultButtonDisabled : ""}`}
                          onClick={() => !isHidden && handleToggleDefault(model.id)}
                          type="button"
                          title={isDefault ? "Remove default" : "Set as default model"}
                          disabled={isHidden}
                        >
                          <Check size={14} />
                          <span>Default</span>
                        </button>
                      </div>

                      <div className={styles.modelCardBody}>
                        <div className={styles.aliasField}>
                          <label htmlFor={`alias-${model.id}`}>Alias</label>
                          <input
                            id={`alias-${model.id}`}
                            type="text"
                            className={styles.aliasInput}
                            value={aliasValue}
                            onChange={(e) => !isHidden && handleAliasChange(model.id, e.target.value)}
                            placeholder="Optional display name"
                            disabled={isHidden}
                          />
                        </div>

                        <div className={styles.contextField}>
                          <label htmlFor={`context-${model.id}`}>Context Window</label>
                          <input
                            id={`context-${model.id}`}
                            type="number"
                            className={styles.contextInput}
                            value={contextValue}
                            onChange={(e) => !isHidden && handleContextChange(model.id, e.target.value)}
                            placeholder={settings.defaultContextWindow.toString()}
                            min={1024}
                            step={1024}
                            title={customContext ? "Custom context window for this model" : "Empty = use default"}
                            disabled={isHidden}
                          />
                        </div>

                        <button
                          className={styles.hideButton}
                          onClick={() => handleToggleHidden(model.id)}
                          type="button"
                          title={isHidden ? "Show model" : "Hide model"}
                        >
                          {isHidden ? (
                            <Eye size={14} />
                          ) : (
                            <EyeOff size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
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
                              {allAvailableAgents.map((a) => (
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
                    {allAvailableAgents.map((a) => (
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
    </div>
  );
}
