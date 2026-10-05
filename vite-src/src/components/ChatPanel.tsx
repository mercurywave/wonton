import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import React from "react";
import { Send, StopCircle, GitBranch, X, Play, Utensils, Hammer, ChevronDown } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "../components/ChatPanel.module.css";
import { ChatMessage as ChatMessageType, Flow, ToolDefinition } from "../types/chat";
import { useContextWindow } from "../hooks/useContextWindow";
import { useSelectionBubble } from "../hooks/useSelectionBubble";
import { useSettings, useAgentsContext, useChats, useProjects, useNav, useFlowsContext, useToolsContext, useEventBus } from "../contexts";
import { chatStore } from "../store/chats";
import { isBackendConnected } from "../utils/platformUtils";
import ModelPicker from "./ModelPicker";
import AgentPicker from "./AgentPicker";
import ThinkingPicker from "./ThinkingPicker";
import ToolPicker from "./ToolPicker";
import ContextRing from "./ContextRing";
import LogSelector from "./LogSelector";
import FileSelector from "./FileSelector";
import SelectionBubble from "./SelectionBubble";
import FeedbackPopup from "./FeedbackPopup";
import ToastPopup from "./ToastPopup";
import { getDisplayName } from "../utils/modelUtils";
import { getAvailableTools, getOptionalTools } from "../tools";
import { projectMetaStore } from "../store/projectMeta";
import { ProjectMeta } from "../types/chat";
import ResponseTurnGroup from "./ResponseTurnGroup";
import { useResponseTurns } from "../hooks/useResponseTurns";

interface ChatPanelProps {
  messages: ChatMessageType[];
  isLoading: boolean;
  isProcessing: boolean;
  isWorkflowExecuting: boolean;
  isWorkflowActive: boolean;
  onSend: (content: string, modelId: string) => Promise<void>;
  onStop: () => void;
  onFileSelect?: (uniqueName: string) => void;
  tempFileOptions?: Array<{ baseName: string; uniqueName: string }>;
  activeTempFileUniqueName?: string | null;
}

function WorkflowSelector({ workflows, onSelect, selectedWorkflowId }: { workflows: Flow[]; onSelect: (id: string) => void; selectedWorkflowId?: string }) {
  if (workflows.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No workflows available. Add <code>.yaml</code> files to a workflows folder.</p>
      </div>
    );
  }

  return (
    <div className={styles.workflowSelector}>
      <p className={styles.workflowSelectorTitle}>Select a workflow to get started</p>
      <div className={styles.workflowGrid}>
        {workflows.map((flow) => {
          const isCommand = (flow as { isCommand?: boolean }).isCommand;
          return (
            <button
              key={flow.id}
              className={`${styles.workflowCard} ${selectedWorkflowId === flow.id ? styles.workflowCardSelected : ""}`}
              onClick={() => onSelect(flow.id)}
              type="button"
            >
              <div className={styles.workflowCardHeader}>
                {isCommand ? <Play size={16} /> : <GitBranch size={16} />}
                <span className={styles.workflowCardName}>{flow.name}</span>
              </div>
              {flow.description && (
                <p className={styles.workflowCardDescription}>{flow.description}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


export default function ChatPanel({
  messages,
  isLoading,
  isProcessing,
  isWorkflowExecuting,
  onSend,
  onStop,
  onFileSelect,
  activeTempFileUniqueName: activeFileUniqueName
}: ChatPanelProps) {
  const responseTurns = useResponseTurns(messages, isLoading);
  const { visibleModels, resolvedSettings, settings } = useSettings();
  const { mainAgents, allAgents } = useAgentsContext();
  const { projects } = useProjects();
  const { activeProjectId, logId, navigateToLog } = useNav();
  const { 
    chats,
    selectedChatId,
    activeModel,
    activeReasoningEffort,
    onActionButtonClick,
    executeCommand: runCommand,
    setSelectedChatWorkflowId,
    onUserMessageAction,
    enabledToolNames,
    onToolSetChange,
    effectiveAgent,
    effectiveToolNames,
    isMainLog,
  } = useChats();

  const [extensionStatus, setExtensionStatus] = useState<string | null>(null);

  // Chat draft state (migrated from useChatDraft hook)
  const [draft, setDraft] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [writeProjectId, setWriteProjectId] = useState<string | undefined>();
  const [writeChatId, setWriteChatId] = useState<string | undefined>();

  // Load draft when chat changes
  useEffect(() => {
    if (!activeProjectId || !selectedChatId) {
      setDraft("");
      return;
    }

    const loadDraft = async () => {
      if (!isBackendConnected()) {
        setDraft("");
        return;
      }

      await chatStore.load(activeProjectId);
      const metas = chatStore.getChatMetas(activeProjectId);
      const chatMeta = metas.find((m) => m.id === selectedChatId);
      setDraft(chatMeta?.draft || "");
      setWriteProjectId(chatMeta?.projectId || activeProjectId);
      setWriteChatId(selectedChatId);
    };

    loadDraft();

    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });

    // Subscribe to chat metadata changes (e.g. from extensions calling won.setChatDraft())
    const unsubscribe = chatStore.subscribe(activeProjectId, () => {
      const chatMeta = chatStore.getChat(activeProjectId, selectedChatId);
      if (chatMeta) {
        setDraft(chatMeta.draft || "");
        setWriteProjectId(chatMeta.projectId || activeProjectId);
        setWriteChatId(selectedChatId);
      }
    });

    return unsubscribe;
  }, [activeProjectId, selectedChatId]);

  // Debounced save to file on interval
  useEffect(() => {
    if (!writeProjectId || !writeChatId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      chatStore.setChatDraft(writeProjectId, writeChatId, draft, true);
    }, 5000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [draft, writeProjectId, writeChatId]);
  const { flows, enabledWorkflows, commandFlows, disabledFlows } = useFlowsContext();
  const { tools: projectTools } = useToolsContext();
  const { on: onEvent } = useEventBus();
  const [showCommandsPopup, setShowCommandsPopup] = useState(false);
  const [showToolPicker, setShowToolPicker] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const enabledCommands = useMemo(
    () => commandFlows.filter((f) => !disabledFlows.includes(f.id)),
    [commandFlows, disabledFlows]
  );
  const activeProject = projects.find((p) => p.id === activeProjectId);
  const [projectMeta, setProjectMeta] = useState<ProjectMeta | null>(null);

  useEffect(() => {
    if (!activeProjectId) {
      setProjectMeta(null);
      return;
    }

    const loadMeta = async () => {
      await projectMetaStore.load(activeProjectId);
      setProjectMeta(projectMetaStore.getProjectMeta(activeProjectId));
    };

    loadMeta();
    const unsubscribe = projectMetaStore.subscribe(activeProjectId, () => {
      setProjectMeta(projectMetaStore.getProjectMeta(activeProjectId));
    });

    return unsubscribe;
  }, [activeProjectId]);

  const presetTools = useMemo(() => {
    if (!projectMeta) return [] as { name: string; command: string }[];

    const presets = [
      { key: "presetBuildCommand" as const, name: "build" },
      { key: "presetRunCommand" as const, name: "run" },
      { key: "presetLintCommand" as const, name: "lint" },
      { key: "presetTestCommand" as const, name: "test" },
    ];

    return presets.flatMap((preset) => {
      const command = projectMeta[preset.key];
      if (!command || !command.trim()) return [];
      return [{ name: preset.name, command: command.trim() }];
    });
  }, [projectMeta]);

  const currentChat = useMemo(() => {
    if (!selectedChatId) return null;
    return chats.find((c) => c.id === selectedChatId) ?? null;
  }, [chats, selectedChatId]);

  // Resolve the effective system prompt for display (uses centralized effectiveAgent from context)
  const resolvedSystemPrompt = useMemo(() => {
    return effectiveAgent?.systemPrompt || resolvedSettings.systemPrompt;
  }, [effectiveAgent, resolvedSettings.systemPrompt]);

  const resolvedWorkflow = flows.find((f) => f.id === currentChat?.workflowId);
  const resolvedStateMessage = resolvedWorkflow?.states?.[currentChat?.workflowStateKey ?? ""]?.message;
  const resolvedActionButtons = resolvedWorkflow?.states?.[currentChat?.workflowStateKey ?? ""]?.actionButtons;
  const chatName = currentChat?.name;

  // Build log options: main log + subagents + version history + queries
  const logOptions = useMemo(() => {
    if (!currentChat) return [];
    const options: Array<{ id: string; label: string }> = [
      { id: currentChat.logId, label: "Main" },
    ];
    const subagents = (currentChat.subagents || []).sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < subagents.length; i++) {
      const subagent = subagents[i];
      const agent = allAgents.find((a) => a.id === subagent.agentId);
      const agentName = agent?.name || "Subagent";
      options.push({
        id: subagent.logId,
        label: `${agentName} ${i + 1}`,
      });
    }
    const versionHistory = (currentChat.versionHistory || []).sort((a, b) => a.createdAt - b.createdAt);
    for (let i = 0; i < versionHistory.length; i++) {
      const version = versionHistory[i];
      const creationTime = new Date(version.createdAt).toLocaleTimeString();
      options.push({
        id: version.logId,
        label: `Version ${i + 1} (${creationTime})`,
      });
    }
    if (currentChat.queriesLogId) {
      options.push({
        id: currentChat.queriesLogId,
        label: "Queries",
      });
    }
    return options;
  }, [currentChat, allAgents]);

  const effectiveLogId = logId || currentChat?.logId;

  // Derive subtitle when a subagent or queries log is selected
  const logSubtitle = useMemo(() => {
    if (!logId || !currentChat) return null;
    if (logId === currentChat.logId) return null;
    if (logId === currentChat.queriesLogId) return "Queries";
    const subagent = currentChat.subagents?.find((s) => s.logId === logId);
    if (!subagent) return null;
    const agent = allAgents.find((a) => a.id === subagent.agentId);
    const agentName = agent?.name || "Subagent";
    const index = (currentChat.subagents || []).findIndex((s) => s.logId === logId);
    return `${agentName} ${index + 1}`;
  }, [logId, currentChat, allAgents]);

  const [availableTools, setAvailableTools] = useState<ToolDefinition[]>([]);
  const [optionalTools, setOptionalTools] = useState<ToolDefinition[]>([]);

  useEffect(() => {
    const loadTools = async () => {
      const [tools, optionalTools] = await Promise.all([
        getAvailableTools(activeProject?.folderPath, effectiveAgent, allAgents, effectiveToolNames),
        getOptionalTools(activeProject?.folderPath, effectiveAgent, allAgents),
      ]);
      
      // Merge project tools with workflow tools (workflow tools overwrite by name)
      const toolMap = new Map<string, { name: string; description: string }>();
      for (const t of projectTools) {
        toolMap.set(t.name, { name: t.name, description: t.description });
      }
      if (resolvedWorkflow?.tools) {
        for (const t of resolvedWorkflow.tools) {
          toolMap.set(t.name, { name: t.name, description: t.description });
        }
      }
      const customToolDefs = Array.from(toolMap.values()).map((t) => ({
        type: "function" as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: { type: "object", properties: {} } as object,
        },
      }));
      setAvailableTools([...tools, ...customToolDefs]);
      setOptionalTools(optionalTools);
    };
    loadTools();
  }, [activeProject?.folderPath, effectiveAgent, allAgents, effectiveToolNames, resolvedWorkflow?.tools, projectTools]);
  const { maxTokens } = useContextWindow(activeModel, resolvedSettings, settings.defaultContextWindow);

  const usageTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === "assistant" && msg.stats) {
        const s = msg.stats;
        return (s.promptTokens || 0) + (s.completionTokens || 0) + (s.cacheN || 0);
      }
    }
    return 0;
  }, [messages]);

  // Build text content for tokenization
  const toolsForTokenize = useMemo((): ToolDefinition[] => {
    if (availableTools.length === 0) return [];
    return availableTools.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }));
  }, [availableTools]);

  const toolsJson = useMemo(
    () => JSON.stringify(toolsForTokenize, null, 2),
    [toolsForTokenize]
  );

  const messagesText = useMemo(
    () =>
      messages
        .map((m) => {
          if (m.toolCalls && m.toolCalls.length > 0) {
            const toolCallText = m.toolCalls
              .map((tc) => JSON.stringify({
                type: "function",
                id: tc.id,
                function: { name: tc.name, arguments: tc.arguments },
              }))
              .join("\n");
            return `[${m.role}]: ${m.content ?? ""}\n${toolCallText}`;
          }
          return `[${m.role}]: ${m.content ?? ""}`;
        })
        .join("\n"),
    [messages]
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const { bubbleData, dismiss: dismissBubble } = useSelectionBubble(messagesContainerRef);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [draft]);

  const handleBubbleComment = useCallback((selectedText: string) => {
    if (!selectedText) {
      dismissBubble();
      return;
    }
    const normalized = selectedText.replace(/\r?\n/g, " ");
    let processed = normalized;
    if (processed.length > 200) {
      const half = Math.floor((200 - 3) / 2);
      processed = processed.slice(0, half) + "..." + processed.slice(processed.length - half);
    }
    const reText = `RE "${processed}": `;
    setDraft(prev => prev + (prev.length > 0 ? "\n" : "") + reText);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      const prevLength = textareaRef.current?.value.length ?? 0;
      const cursorPos = prevLength + (prevLength > 0 ? 1 : 0) + reText.length;
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = cursorPos;
      }
    });
    dismissBubble();
  }, [dismissBubble]);

  // Listen for RE comments from FileViewerPanel via event bus
  useEffect(() => {
    const handleReComment = (payload: unknown) => {
      const reText = payload as string;
      setDraft(prev => prev + (prev.length > 0 ? "\n" : "") + reText);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
        const prevLength = textareaRef.current?.value.length ?? 0;
        const cursorPos = prevLength + (prevLength > 0 ? 1 : 0) + reText.length;
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = cursorPos;
        }
      });
    };

    return onEvent("re-comment", handleReComment);
  }, [onEvent, setDraft]);

  useEffect(() => {
    const handleExtensionStatus = (payload: unknown) => {
      setExtensionStatus(payload as string ?? null);
    };
    return onEvent("setExtensionStatus", handleExtensionStatus);
  }, [onEvent]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        setShowCommandsPopup(false);
      }
    }
    if (showCommandsPopup) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showCommandsPopup]);

  useEffect(() => {
    if (mainContentRef.current) {
      requestAnimationFrame(() => {
        mainContentRef.current!.scrollTop = mainContentRef.current!.scrollHeight;
      });
    }
  }, [messages.length]);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      const trimmed = draft.trim();
      if (!trimmed || isLoading) return;
      setDraft("");
      await onSend(trimmed, activeModel);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [draft, isLoading, onSend, activeModel, setDraft]
  );

  const shouldShowStopButton = isProcessing || isWorkflowExecuting;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e);
      }
    },
    [handleSubmit]
  );

  return (
    <div className={styles.container}>
      <div className={styles.mainContent} ref={mainContentRef}>
        {chatName && (
          <div className={styles.chatHeader}>
            <span className={styles.chatHeaderName}>
              {logSubtitle ? (
                <>
                  <span
                    onClick={() => navigateToLog(currentChat!.logId)}
                    className={styles.chatHeaderNameClickable}
                  >
                    {chatName}
                  </span>
                  <span className={styles.headerSeparator}>{" > "}</span>
                  <span className={styles.headerSubtitle}>{logSubtitle}</span>
                </>
              ) : (
                chatName
              )}
            </span>
            <div className={styles.chatHeaderDropdowns}>
              <LogSelector
                logs={logOptions}
                activeLogId={effectiveLogId || currentChat?.logId || ""}
                onLogChange={navigateToLog}
              />
              {onFileSelect && (
                <FileSelector
                  files={currentChat?.reservedTempFiles || []}
                  activeFileUniqueName={activeFileUniqueName || null}
                  onFileSelect={onFileSelect}
                />
              )}
            </div>
          </div>
        )}
        
        <details className={styles.systemPromptCollapse}>
          <summary className={styles.systemPromptSummary}>system prompt</summary>
          <pre className={styles.systemPromptContent}>{resolvedSystemPrompt}</pre>
        </details>
        {(availableTools.length > 0 || presetTools.length > 0) && (
          <details className={styles.systemPromptCollapse}>
            <summary className={styles.systemPromptSummary}>tools</summary>
            <div className={styles.toolsGrid}>
              {availableTools.map((tool) => (
                <div key={tool.function.name} className={styles.toolCard}>
                  <div className={styles.toolCardName}>{tool.function.name}</div>
                  <div className={styles.toolCardDesc} title={tool.function.description}>{tool.function.description}</div>
                </div>
              ))}
            </div>
            {presetTools.length > 0 && (
              <div className={styles.presetToolsSection}>
                <div className={styles.toolsGrid}>
                  {presetTools.map((tool) => (
                    <div key={tool.name} className={styles.toolCard}>
                      <div className={styles.toolCardName}>{tool.name}</div>
                      <div className={styles.toolCardDesc} title={tool.command}>{tool.command}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </details>
        )}
        <div className={styles.messages} ref={messagesContainerRef}>
          {messages.length === 0 && (
            <WorkflowSelector
              workflows={enabledWorkflows.filter((f) => !(f as { isCommand?: boolean }).isCommand)}
              onSelect={(id) => {
                const flow = enabledWorkflows.find((f) => f.id === id);
                setSelectedChatWorkflowId(id, flow?.initialState);
              }}
              selectedWorkflowId={(resolvedWorkflow?.id)}
            />
          )}
          {responseTurns.map((turn, idx) => (
            <ResponseTurnGroup
              key={turn.userMessage.id + "-" + idx}
              turnGroup={turn}
              modelAliases={resolvedSettings.modelAliases}
              selectedChatId={selectedChatId}
              onUserMessageAction={onUserMessageAction}
              isStreaming={isLoading}
              isLastVisible={idx >= Math.max(0, responseTurns.length - 3)}
              isMainLog={isMainLog}
            />
          ))}
            {isProcessing && (
              <div className={styles.thinkingIndicator}>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
                <span className={styles.dot}></span>
              </div>
            )}
            <div ref={messagesEndRef} />
           {bubbleData && (
             <SelectionBubble
               position={bubbleData}
               selectedText={bubbleData.text}
               onComment={handleBubbleComment}
             />
           )}
        </div>
       </div>

       <FeedbackPopup />
        <ToastPopup />

       {extensionStatus && (
         <div className={styles.extensionStatusBar}>
           <div className={styles.extensionStatusInner}>
             <span className={styles.extensionStatusText}>{extensionStatus}</span>
             <button
               className={styles.workflowStateMessageRemove}
               onClick={() => setExtensionStatus(null)}
               type="button"
               title="Dismiss status"
             >
               <X size={14} />
             </button>
           </div>
         </div>
       )}

       {resolvedStateMessage && (
        <div className={styles.workflowStateMessageBar}>
          <div className={styles.workflowStateMessageInner}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resolvedStateMessage}</ReactMarkdown>
            <div className={styles.workflowStateActionButtons}>
              {resolvedActionButtons?.map((btn) => (
                <button
                  key={`action-${btn.idx}`}
                  className={styles.workflowStateActionButton}
                  onClick={() => onActionButtonClick(btn, logId ?? undefined)}
                  type="button"
                >
                  {btn.label}
                </button>
              ))}
              {resolvedWorkflow && (
                <button
                  className={styles.workflowStateMessageRemove}
                  onClick={() => setSelectedChatWorkflowId(undefined, undefined)}
                  type="button"
                  title="Remove workflow"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <form className={styles.inputArea} onSubmit={handleSubmit}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              if (writeProjectId && writeChatId) {
                chatStore.setChatDraft(writeProjectId, writeChatId, draft, true);
              }
            }}
            placeholder="Type a message..."
            rows={1}
          />
          {shouldShowStopButton ? (
            <button
              type="button"
              className={styles.stopButton}
              onClick={onStop}
              title="Stop generation"
            >
              <StopCircle size={18} />
            </button>
          ) : (
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!draft.trim()}
              title="Send message"
            >
              <Send size={18} />
            </button>
          )}
        </div>
      </form>

      <div className={styles.footer}>
        <div className={styles.footerContainer}>
          <div className={styles.footerSelectors}>
            {isMainLog ? (
              <ModelPicker
                models={visibleModels}
                modelAliases={resolvedSettings.modelAliases}
              />
            ) : (
              <div className={styles.staticSelector} data-type="model">
                <span className={styles.staticLabel}>{getDisplayName(activeModel, resolvedSettings.modelAliases)}</span>
                <ChevronDown size={14} className={styles.staticChevron} />
              </div>
            )}
            {isMainLog ? (
              <AgentPicker agents={mainAgents} />
            ) : (
              <div className={styles.staticSelector} data-type="agent">
                <span className={styles.staticLabel}>{effectiveAgent?.name || "Unknown"}</span>
                <ChevronDown size={14} className={styles.staticChevron} />
              </div>
            )}
            {isMainLog ? (
              <ThinkingPicker />
            ) : (
              <div className={styles.staticSelector} data-type="thinking">
                <span className={styles.staticLabel}>
                  {activeReasoningEffort === "none" ? "None" : activeReasoningEffort === "low" ? "Low" : activeReasoningEffort === "medium" ? "Medium" : activeReasoningEffort === "high" ? "High" : "None"}
                </span>
                <ChevronDown size={14} className={styles.staticChevron} />
              </div>
            )}
          </div>
          <div className={styles.footerRight}>
            <button
              type="button"
              className={styles.commandButton}
              onClick={() => setShowCommandsPopup(!showCommandsPopup)}
              title="Run command"
              disabled={enabledCommands.length === 0}
            >
              <Utensils size={16} />
            </button>
            {showCommandsPopup && (
              <div ref={popupRef} className={styles.commandPopupWrapper}>
                <div className={styles.commandPopup}>
                  <div className={styles.commandPopupHeader}>Commands</div>
                  {enabledCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      className={styles.commandPopupItem}
                      onClick={() => {
                        runCommand(cmd.id);
                        setShowCommandsPopup(false);
                      }}
                      type="button"
                    >
                      {cmd.name}
                    </button>
                  ))}
                  {enabledCommands.length === 0 && (
                    <div className={styles.commandPopupEmpty}>No commands available</div>
                  )}
                </div>
              </div>
            )}
            <button
              type="button"
              className={`${styles.commandButton} ${optionalTools.length > 0 && enabledToolNames.length > 0 ? styles.commandButtonHasExtras : ""}`}
              onClick={() => setShowToolPicker(!showToolPicker)}
              title="Toggle tools"
              disabled={optionalTools.length === 0}
            >
              <Hammer size={16} />
            </button>
            {showToolPicker && (
              <ToolPicker
                availableTools={optionalTools}
                enabledToolNames={enabledToolNames}
                onToolSetChange={onToolSetChange}
                onClose={() => setShowToolPicker(false)}
              />
            )}
            <ContextRing
              usageTokens={usageTokens}
              maxTokens={maxTokens}
              serverUrl={resolvedSettings.serverUrl}
              model={activeModel}
              systemPrompt={resolvedSystemPrompt}
              toolsJson={toolsJson}
              messagesText={messagesText}
            />
        </div>
        </div>
      </div>
    </div>
  );
}
