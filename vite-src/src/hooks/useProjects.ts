import { useState, useEffect, useCallback } from "react";
import { Project } from "../types/project";
import { projectStore } from "../store/projects";

export function useProjectsData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const refresh = useCallback(() => {
    setProjects(projectStore.getProjects());
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      await projectStore.load();
      if (!cancelled) {
        refresh();
        setIsLoading(false);
        setInitialized(true);
      }
    })();

    const unsubscribe = projectStore.subscribe(refresh);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refresh]);

  const createProject = useCallback(async (name: string, folderPath?: string) => {
    await projectStore.createProject(name, folderPath);
  }, []);

  const createProjectFromFolder = useCallback(async (folderPath: string) => {
    const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
    const name = folderName.charAt(0).toUpperCase() + folderName.slice(1);
    await createProject(name, folderPath);
  }, [createProject]);

  const updateProjectFolder = useCallback(async (id: string, folderPath: string | null) => {
    await projectStore.updateProject(id, { folderPath: folderPath || undefined, updatedAt: Date.now() });
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    await projectStore.updateProject(id, updates);
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await projectStore.deleteProject(id);
  }, []);

  const getProjectById = useCallback(
    (id: string) => projectStore.getProjectById(id),
    []
  );

  return {
    projects,
    isLoading,
    initialized,
    getProjectById,
    createProject,
    createProjectFromFolder,
    updateProjectFolder,
    updateProject,
    deleteProject,
  };
}
