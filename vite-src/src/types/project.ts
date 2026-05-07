export interface Project {
  id: string;
  name: string;
  folderPath?: string;
  createdAt: number;
  updatedAt?: number;
}

export interface ProjectsData {
  projects: Project[];
}
