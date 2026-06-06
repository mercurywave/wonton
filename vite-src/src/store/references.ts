export interface ReferenceSearchResult {
  path: string;
  size: number;
  matches: ReferenceMatch[];
}

export interface ReferenceMatch {
  line: number;
  content: string;
  contextBefore: string[];
  contextAfter: string[];
}

export interface ReferencesCache {
  projectId: string | null;
  query: string;
  results: ReferenceSearchResult[];
  selectedFilePath: string | null;
}

const cache: ReferencesCache = {
  projectId: null,
  query: "",
  results: [],
  selectedFilePath: null,
};

export function clearOnProjectChange(newProjectId: string): void {
  if (cache.projectId !== newProjectId) {
    cache.projectId = newProjectId;
    cache.query = "";
    cache.results = [];
    cache.selectedFilePath = null;
  }
}

export function getCache(): ReferencesCache {
  return cache;
}

export function setQuery(query: string): void {
  cache.query = query;
}

export function setResults(results: ReferenceSearchResult[]): void {
  cache.results = results;
}

export function setSelectedFilePath(path: string | null): void {
  cache.selectedFilePath = path;
}
