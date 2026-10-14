type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();

export function resetRateLimitsForTests(): void {
  buckets.clear();
}

export function resolvePerMinute(configured: number | undefined): number {
  const raw = process.env.HARNESS_RATE_LIMIT_OVERRIDE;
  if (process.env.NODE_ENV !== "production" && raw) {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0 && parsed <= 1000) return parsed;
  }
  return configured ?? 60;
}

/** Sliding one-minute window. Returns false when the caller is over the limit. */
export function consumeRate(key: string, perMinute: number): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((ts) => ts > windowStart);
  if (bucket.hits.length >= perMinute) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}
