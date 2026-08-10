export interface ServerEntry {
  id: string;
  name: string;
  serverUrl: string;
  apiKey: string;
  defaultModel: string;
  contextWindows: Record<string, number>;
  modelAliases: Record<string, string>;
  hiddenModels: string[];
}
