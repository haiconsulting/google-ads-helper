/**
 * Server-only logs for /api/recommend. Search the dev terminal for `[recommend]`.
 */
export function recommendLog(
  requestId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta?: Record<string, unknown>
): void {
  const line = `[recommend] ${requestId} ${message}`;
  const extra = meta && Object.keys(meta).length > 0 ? meta : undefined;
  if (level === "error") {
    extra ? console.error(line, extra) : console.error(line);
  } else if (level === "warn") {
    extra ? console.warn(line, extra) : console.warn(line);
  } else {
    extra ? console.info(line, extra) : console.info(line);
  }
}
