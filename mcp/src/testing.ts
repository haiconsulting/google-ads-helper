import { resetAuthForTests } from "./auth";
import { resetRateLimitsForTests } from "./rateLimit";
import { resetToggleForTests } from "./toggle";

/** Clears process-local auth, rate-limit, and toggle state. Tests only. */
export function resetConnectorForTests(): void {
  resetAuthForTests();
  resetRateLimitsForTests();
  resetToggleForTests();
}
