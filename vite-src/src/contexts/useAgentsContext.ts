import { useContext } from "react";
import { AgentsContext, AgentsContextValue } from "./AgentsContext.ts";

export function useAgentsContext(): AgentsContextValue {
  const ctx = useContext(AgentsContext);
  if (!ctx) {
    throw new Error("useAgentsContext must be used within an AgentsProvider");
  }
  return ctx;
}
