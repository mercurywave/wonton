import {
  createContext,
  useContext,
  ReactNode,
  useMemo,
} from "react";
import { useProjectsData } from "../hooks/useProjects";
import { Project } from "../types/project";

interface ProjectsContextValue {
  projects: Project[];
  isLoading: boolean;
  initialized: boolean;
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

  const value = useMemo(
    () => ({
      projects,
      isLoading,
      initialized,
      getProjectById,
      createProject,
      createProjectFromFolder,
      updateProjectFolder,
      updateProject,
      deleteProject,
    }),
    [projects, isLoading, initialized, getProjectById, createProject, createProjectFromFolder, updateProjectFolder, updateProject, deleteProject]
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
