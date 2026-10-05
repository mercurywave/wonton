import { FlowCustomTool, ProjectCustomTool, ProjectMeta } from "../types/chat";

export function getPresetCommandTools(projectMeta?: ProjectMeta | null): FlowCustomTool[] {
  if (!projectMeta) return [];

  const presets = [
    { key: "presetBuildCommand" as const, name: "build", label: "Build" },
    { key: "presetRunCommand" as const, name: "run", label: "Run" },
    { key: "presetLintCommand" as const, name: "lint", label: "Lint" },
    { key: "presetTestCommand" as const, name: "test", label: "Test" },
  ];

  return presets.flatMap((preset) => {
    const command = projectMeta[preset.key];
    return command?.trim()
      ? [{
          name: preset.name,
          description: `Runs the ${preset.label} command for this project: ${command}`,
          code: `return won.runCommand(${JSON.stringify(command)});`,
        }]
      : [];
  });
}

/**
 * Combines project tools, flow tools, and preset tools into a single
 * FlowCustomTool[] array. Priority order (highest to lowest):
 *   1. Project tools (from YAML tool definitions)
 *   2. Flow tools (from active flow definitions)
 *   3. Preset tools (from projectMeta preset commands)
 *
 * Tools with the same name are deduplicated, with higher-priority sources
 * taking precedence.
 */
export function combineCustomTools(
  projectTools: ProjectCustomTool[],
  flowTools?: FlowCustomTool[],
  presetTools?: FlowCustomTool[],
): FlowCustomTool[] {
  const toolMap = new Map<string, FlowCustomTool>();

  // Preset tools first (lowest priority)
  if (presetTools) {
    for (const t of presetTools) {
      toolMap.set(t.name, t);
    }
  }

  // Flow tools override presets
  if (flowTools) {
    for (const t of flowTools) {
      toolMap.set(t.name, t);
    }
  }

  // Project tools override both (highest priority)
  for (const t of projectTools) {
    toolMap.set(t.name, t);
  }

  return Array.from(toolMap.values());
}
