import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { useProjectsData } from "../hooks/useProjects";
import { useSettings } from "./SettingsContext";
import { Project } from "../types/project";

interface ProjectsContextValue {
  projects: Project[];
  isLoading: boolean;
  initialized: boolean;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: Project | undefined;
  getProjectById: (id: string) => Project | undefined;
  createProject: (name: string, folderPath?: string) => Promise<void>;
  createProjectFromFolder: (folderPath: string) => Promise<void>;
  updateProjectFolder: (id: string, folderPath: string | null) => Promise<void>;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const {
    projects,
    isLoading,
    initialized,
    getProjectById,
    createProject,
    createProjectFromFolder,
    updateProjectFolder,
    updateProject,
    deleteProject,
  } = useProjectsData();

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    return projects.find((p) => p.id === "default")?.id ?? "default";
  });

  const [restoredProject, setRestoredProject] = useState(false);
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    if (projects.length > 0 && !restoredProject) {
      setRestoredProject(true);
      const hasDefault = projects.some((p) => p.id === "default");
      const lastId = settings.lastProjectId;
      if (lastId && lastId !== "default" && projects.some((p) => p.id === lastId)) {
        setActiveProjectId(lastId);
      } else if (hasDefault) {
        setActiveProjectId("default");
      }
    }
  }, [projects, restoredProject, settings.lastProjectId]);

  const handleSetActiveProjectId = useCallback(
    (id: string) => {
      setActiveProjectId(id);
      updateSettings({ lastProjectId: id });
    },
    [updateSettings]
  );

 const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId),
    [projects, activeProjectId]
  );

  const value = useMemo(
    () => ({
      projects,
      isLoading,
      initialized,
      activeProjectId,
      setActiveProjectId: handleSetActiveProjectId,
      activeProject,
      getProjectById,
      createProject,
      createProjectFromFolder,
      updateProjectFolder,
      updateProject,
      deleteProject,
    }),
    [projects, isLoading, initialized, activeProjectId, handleSetActiveProjectId, activeProject, getProjectById, createProject, createProjectFromFolder, updateProjectFolder, updateProject, deleteProject]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects(): ProjectsContextValue {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within a ProjectsProvider");
  }
  return ctx;
}
