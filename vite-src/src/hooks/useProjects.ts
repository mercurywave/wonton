import { useState, useEffect, useCallback } from "react";
import { Project } from "../types/project";
import {
  PROJECTS_FILE_NAME,
  DEFAULT_PROJECT_ID,
  isNeutralinoConnected,
  getProjectDataDir,
  generateGuid,
} from "./neuUtils";
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

export function useProjects() {
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
      const wontonDir = dataDirPath;
      try {
        await filesystem.readDirectory(wontonDir);
      } catch (err) {
        console.error("useProjects: failed to read directory", err);
        await filesystem.createDirectory(wontonDir);
      }
    } catch (err) {
      console.error("useProjects: failed to get data dir path", err);
      setProjects([createDefaultProject()]);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;

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
        const filePath2 = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
        await filesystem.writeFile(filePath2, JSON.stringify([defaultProject], null, 2));
      } catch (err2) {
        console.error("useProjects: failed to write default projects file", err2);
      }
    }

    // Ensure the default project's folder structure exists
    if (isNeutralinoConnected()) {
      try {
        const projMeta = await loadProjectMeta(DEFAULT_PROJECT_ID);
        if (!projMeta.activeChatId) {
          await ensureChatFolderNative(DEFAULT_PROJECT_ID);
        }
      } catch (err) {
        console.error("useProjects: failed to ensure default project folder", err);
      }
    }

    setIsLoading(false);
    setInitialized(true);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const createProject = useCallback(async (name: string) => {
    const newProject: Project = {
      id: generateGuid(),
      name,
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
    updateProject,
    deleteProject,
  };
}
