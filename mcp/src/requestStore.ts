import { AsyncLocalStorage } from "node:async_hooks";
import type { ToolContext } from "./tools/types";

export const requestStore = new AsyncLocalStorage<ToolContext>();
