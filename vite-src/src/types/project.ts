export interface Project {
  id: string;
  name: string;
  createdAt: number;
}

export interface ProjectsData {
  projects: Project[];
}
