export function getDisplayName(modelId: string, modelAliases: Record<string, string>): string {
  return modelAliases[modelId] || modelId;
}
