import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Project } from "../types/project";
import styles from "../components/ProjectSelector.module.css";

interface ProjectSelectorProps {
  projects: Project[];
  activeProjectId: string;
  onProjectSelect: (projectId: string) => void;
 
  isOpen: boolean;
}

export default function ProjectSelector({
  projects,
  activeProjectId,
  onProjectSelect,
 
  isOpen,
}: ProjectSelectorProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);
  const displayName = activeProject?.name ?? "Default";

  return (
    <div className={`${styles.container} ${isOpen ? "" : styles.collapsed}`} ref={dropdownRef}>
      <div className={styles.dropdown}>
        <button
          className={styles.trigger}
          onClick={() => setIsDropdownOpen((prev) => !prev)}
        >
          <span className={styles.selectedText}>
            {displayName}
          </span>
          {isDropdownOpen ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>
        {isDropdownOpen && (
          <div className={styles.menu}>
            {projects.map((project) => (
              <button
                key={project.id}
                className={`${styles.option} ${
                  project.id === activeProjectId ? styles.active : ""
                }`}
                onClick={() => {
                  onProjectSelect(project.id);
                  setIsDropdownOpen(false);
                }}
              >
                <span className={styles.optionLabel}>{project.name}</span>
                {project.id === activeProjectId && (
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
