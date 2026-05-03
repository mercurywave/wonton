import { useState, useEffect, useCallback } from "react";
import { Project } from "../types/project";
import { computer, filesystem, os, OSInfo } from "@neutralinojs/lib";

const DATA_DIR_NAME = "wonton";
const PROJECTS_FILE_NAME = "projects.json";
const DEFAULT_PROJECT_ID = "default";

function generateGuid(): string {
  return crypto.randomUUID();
}

function createDefaultProject(): Project {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "Default",
    createdAt: Date.now(),
  };
}

async function getLocalAppDataDir(appName: string): Promise<string> {
  const osInfo = await computer.getOSInfo();
  const platform = osInfo.name.toLowerCase();

  if (platform.includes("windows")) {
    const local = await os.getEnv("LOCALAPPDATA");
    return `${local}\\${appName}`;
  }

  if (platform.includes("mac")) {
    const home = await os.getEnv("HOME");
    return `${home}/Library/Application Support/${appName}`;
  }

  const xdg = await os.getEnv("XDG_DATA_HOME");
  if (xdg) {
    return `${xdg}/${appName}`;
  }
  const home = await os.getEnv("HOME");
  return `${home}/.local/share/${appName}`;
}

export function isNeutralinoConnected() {return window.NL_MODE !== undefined};

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [nativeAvailable, setNativeAvailable] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);

    if (!isNeutralinoConnected()) {
      setProjects([createDefaultProject()]);
      setIsLoading(false);
      setInitialized(true);
      return;
    }

    setNativeAvailable(true);

    let dataDirPath: string;
    try {
      dataDirPath = await getLocalAppDataDir(DATA_DIR_NAME);
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
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const hasDefault = parsed.projects.some((p: Project) => p.id === DEFAULT_PROJECT_ID);
        if (!hasDefault) {
          parsed.projects = [createDefaultProject(), ...parsed.projects];
          await filesystem.writeFile(filePath, JSON.stringify(parsed.projects, null, 2));
        }
        setProjects(parsed.projects);
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
    };
    setProjects((prev) => {
      const next = [...prev, newProject];
      if (nativeAvailable) {
        (async () => {
          if (isNeutralinoConnected()) {
            try {
              const dataDirPath = await getLocalAppDataDir(DATA_DIR_NAME);
              const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
              await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            } catch (err) {
              console.error("useProjects: failed to save projects on create", err);
            }
          }
        })();
      }
      return next;
    });
  }, [nativeAvailable]);

  const updateProject = useCallback(async (id: string, updates: Partial<Pick<Project, "name">>) => {
    setProjects((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      if (nativeAvailable && updates.name !== undefined) {
        (async () => {
          if (isNeutralinoConnected()) {
            try {
              const dataDirPath = await getLocalAppDataDir(DATA_DIR_NAME);
              const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
              await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            } catch (err) {
              console.error("useProjects: failed to save projects on update", err);
            }
          }
        })();
      }
      return next;
    });
  }, [nativeAvailable]);

  const deleteProject = useCallback(async (id: string) => {
    if (id === DEFAULT_PROJECT_ID) return;
    setProjects((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (nativeAvailable) {
        (async () => {
          if (isNeutralinoConnected()) {
            try {
              const dataDirPath = await getLocalAppDataDir(DATA_DIR_NAME);
              const filePath = `${dataDirPath}/${PROJECTS_FILE_NAME}`;
              await filesystem.writeFile(filePath, JSON.stringify(next, null, 2));
            } catch (err) {
              console.error("useProjects: failed to save projects on delete", err);
            }
          }
        })();
      }
      return next;
    });
  }, [nativeAvailable]);

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
