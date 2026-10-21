/**
 * Limits on wrong codes. A code is six digits, so guessing must be slow: at most MAX_PER_IP wrong codes per address
 * and MAX_TOTAL in total within WINDOW_MS. A correct code is never limited by someone else's mistakes beyond the
 * total limit, which stops a guess spread over many addresses.
 */

export const WINDOW_MS = 10 * 60_000
export const MAX_PER_IP = 10
export const MAX_TOTAL = 200

interface Bucket {
  window_start: number
  failures: number
}

/** {@return failures still counting in a bucket's window} */
export function counted(bucket: Bucket | null, now: number): number {
  return bucket && now - bucket.window_start < WINDOW_MS ? bucket.failures : 0
}

/** {@return ms until the address may try again, or 0 when it may now} */
export async function blockedFor(db: D1Database, ip: string, now: number): Promise<number> {
  const rows = await db.prepare("SELECT bucket, window_start, failures FROM login_failures WHERE bucket IN (?1, 'all')")
    .bind(`ip:${ip}`).all<Bucket & { bucket: string }>()
  let wait = 0
  for (const row of rows.results) {
    const limit = row.bucket === 'all' ? MAX_TOTAL : MAX_PER_IP
    if (counted(row, now) >= limit) wait = Math.max(wait, row.window_start + WINDOW_MS - now)
  }
  return wait
}

/** Counts a wrong code for an address and in total. */
export async function recordFailure(db: D1Database, ip: string, now: number): Promise<void> {
  // A window that ended starts again at 1
  const upsert = db.prepare(`INSERT INTO login_failures (bucket, window_start, failures) VALUES (?1, ?2, 1)
      ON CONFLICT (bucket) DO UPDATE SET
        failures = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE failures + 1 END,
        window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END`)
  await db.batch([upsert.bind(`ip:${ip}`, now, WINDOW_MS), upsert.bind('all', now, WINDOW_MS),
    db.prepare("DELETE FROM login_failures WHERE bucket <> 'all' AND window_start < ?1").bind(now - WINDOW_MS)])
}
