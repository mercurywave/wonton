import { useState, useEffect, useCallback } from "react";
import { Project } from "../types/project";
import {
  PROJECTS_FILE_NAME,
  DEFAULT_PROJECT_ID,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "../utils/neuUtils";
import {
  ensureChatFolder as ensureChatFolderNative,
  deleteProjectFolder as deleteProjectFolderNative,
  updateProjectMeta,
  loadProjectMeta,
} from "./useChatPersistence";
import { filesystem } from "@neutralinojs/lib";

function createDefaultProject(): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "Default",
    createdAt: Date.now(),
  };
}

export function useProjectsData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    if (!isNeutralinoConnected()) {
      setProjects([createDefaultProject()]);
      setIsLoading(false);
      setInitialized(true);
      return;
    }
    let dataDirPath: string;
    try {
      dataDirPath = await getProjectDataDir("");
    } catch (err) {
      console.error("useProjects: failed to get data dir path", err);
      setProjects([createDefaultProject()]);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    const wontonDir = dataDirPath;
    try {
      await filesystem.createDirectory(wontonDir);
    } catch (err: any) {
      if (err.code !== "NE_FS_DIRCRER") {
        console.error("useProjects: failed to create directory", err);
      }
    }

    // Ensure the default project's folder structure exists before loading
    if (isNeutralinoConnected()) {
      try {
        const projMeta = await loadProjectMeta(DEFAULT_PROJECT_ID);
        if (!projMeta.createdAt) {
          await ensureChatFolderNative(DEFAULT_PROJECT_ID);
        }
      } catch (err) {
        console.error("useProjects: failed to ensure default project folder", err);
      }
    }

    const filePath = `${wontonDir}/${PROJECTS_FILE_NAME}`;

    try {
      const content = await filesystem.readFile(filePath);
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed) && parsed.length > 0) {
        const hasDefault = parsed.some((p: Project) => p.id === DEFAULT_PROJECT_ID);
        if (!hasDefault) {
          parsed.unshift(createDefaultProject());
          await filesystem.writeFile(filePath, JSON.stringify(parsed, null, 2));
        }
        setProjects(parsed);
      } else {
        const defaultProject = createDefaultProject();
        setProjects([defaultProject]);
        await filesystem.writeFile(filePath, JSON.stringify([defaultProject], null, 2));
      }
    } catch (err) {
      console.error("useProjects: failed to load projects", err);
      const defaultProject = createDefaultProject();
      setProjects([defaultProject]);
      try {
        await filesystem.writeFile(filePath, JSON.stringify([defaultProject], null, 2));
      } catch (err2) {
        console.error("useProjects: failed to write default projects file", err2);
      }
    }

    setIsLoading(false);
    setInitialized(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createProject = useCallback(async (name: string, folderPath?: string) => {
    const newProject: Project = {
      id: generateGuid(),
      name,
      folderPath,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setProjects((prev) => {
      const next = [...prev, newProject];
      if (isNeutralinoConnected()) {
        (async () => {
          try {
            const dataDirPath = await getProjectDataDir("");
            const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
            await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            await ensureChatFolderNative(newProject.id);
          } catch (err) {
            console.error("useProjects: failed to save projects on create", err);
          }
        })();
      }
      return next;
    });
  }, []);

  const createProjectFromFolder = useCallback(async (folderPath: string) => {
    const folderName = folderPath.split(/[\\/]/).pop() || folderPath;
    const name = folderName.charAt(0).toUpperCase() + folderName.slice(1);
    await createProject(name, folderPath);
  }, [createProject]);

  const updateProjectFolder = useCallback(async (id: string, folderPath: string | null) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, folderPath: folderPath || undefined, updatedAt: Date.now() } : p));
      if (isNeutralinoConnected()) {
        (async () => {
          try {
            const dataDirPath = await getProjectDataDir("");
            const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
            await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
          } catch (err) {
            console.error("useProjects: failed to save projects on folder update", err);
          }
        })();
      }
      return next;
    });
  }, []);

  const updateProject = useCallback(async (id: string, updates: Partial<Project>) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p));
      if (isNeutralinoConnected()) {
        (async () => {
          try {
            const dataDirPath = await getProjectDataDir("");
            const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
            await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            if (updates.name !== undefined) {
              await updateProjectMeta(id, { systemPrompt: updates.name });
            }
          } catch (err) {
            console.error("useProjects: failed to save projects on update", err);
          }
        })();
      }
      return next;
    });
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    if (id === DEFAULT_PROJECT_ID) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (isNeutralinoConnected()) {
        (async () => {
          try {
            const dataDirPath = await getProjectDataDir("");
            const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
            await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            await deleteProjectFolderNative(id);
          } catch (err) {
            console.error("useProjects: failed to save projects on delete", err);
          }
        })();
      }
      return next;
    });
  }, []);

  const getProjectById = useCallback(
    (id: string) => projects.find((p) => p.id === id),
    [projects]
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
