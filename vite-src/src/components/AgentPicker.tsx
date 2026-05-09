import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Agent } from "../types/chat";
import styles from "../components/AgentPicker.module.css";

interface AgentPickerProps {
  agents: Agent[];
  activeAgentId: string;
  onAgentChange: (agentId: string) => void;
}

export default function AgentPicker({
  agents,
  activeAgentId,
  onAgentChange,
}: AgentPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (agents.length === 0) return null;

  const activeAgent = agents.find((a) => a.id === activeAgentId);
  const displayName = activeAgent?.name || "Default";

  return (
    <div className={styles.container} ref={dropdownRef}>
      <span className={styles.label}>Agent</span>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsOpen((prev) => !prev)}
          disabled={agents.length === 0}
        >
          <span className={styles.selectedText}>
            {displayName}
          </span>
          {isOpen ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
        {isOpen && (
          <div className={styles.menu}>
            {agents.map((agent) => (
              <button
                key={agent.id}
                className={`${styles.option} ${
                  agent.id === activeAgentId ? styles.active : ""
                }`}
                onClick={() => {
                  onAgentChange(agent.id);
                  setIsOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{agent.name}</span>
                {agent.id === activeAgentId && (
                  <span className={styles.checkmark}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
