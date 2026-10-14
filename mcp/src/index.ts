import { healthStatus } from "./health";
import { applyToggle } from "./toggle";
import { tools } from "./tools";
import manifest from "../manifest.json";

export function createConnector() {
  return {
    manifest,
    tools,
    health: async () => healthStatus(),
    onToggle: async (event: unknown) => {
      await applyToggle(event);
    },
  };
}

export { healthStatus } from "./health";
export { tools } from "./tools";
export { connectorVersion } from "./version";
