import type { RefIndex, RefLabels, RefsReplaceRequest } from '../shared/api'
import { HttpError } from './http'

export const PROVIDERS = ['vulcan', 'tyche', 'exptailor', 'chrysos', 'kleos', 'crius', 'metabasis', 'convo', 'plutus', 'phantasos'] as const
const KIND = /^[a-z0-9_]{1,48}$/
const MAX_LABEL = 128
/** Rows per statement batch (each row binds 5 parameters). */
const ROWS_PER_BATCH = 500

/** {@return the replace request, checked} */
export function readRefs(body: Record<string, unknown>): RefsReplaceRequest {
  const provider = body.provider
  if (typeof provider !== 'string' || !(PROVIDERS as readonly string[]).includes(provider)) {
    throw new HttpError(400, `provider must be one of ${PROVIDERS.join(', ')}`)
  }
  if (!Array.isArray(body.refs)) throw new HttpError(400, 'refs must be a list')
  const refs = body.refs.map((raw, i) => {
    const ref = raw as Record<string, unknown> | null
    if (!ref || typeof ref.kind !== 'string' || !KIND.test(ref.kind) || typeof ref.id !== 'string' || ref.id.length === 0 || ref.id.length > 128) {
      throw new HttpError(400, `refs[${i}] needs a kind (a-z, 0-9, _) and an id`)
    }
    return { kind: ref.kind, id: ref.id, label: readLabel(ref.label) }
  })
  return { provider, refs }
}

/** {@return a ref's display name: text, trimmed, at most 128 characters; anything else is none} */
function readLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const label = raw.trim()
  return label === '' || label.length > MAX_LABEL ? null : label
}

/** Replaces every id of a provider: ids it no longer has disappear. {@return how many were written} */
export async function replaceRefs(db: D1Database, request: RefsReplaceRequest, now: number): Promise<number> {
  const unique = new Map<string, RefsReplaceRequest['refs'][number]>()
  for (const ref of request.refs) unique.set(`${ref.kind}\u0000${ref.id}`, ref)
  const insert = db.prepare('INSERT INTO refs (provider, kind, id, label, synced_at) VALUES (?1, ?2, ?3, ?4, ?5)')
  const rows = [...unique.values()].map((ref) => insert.bind(request.provider, ref.kind, ref.id, ref.label ?? null, now))
  // The delete and the first rows go in one batch (a D1 batch is one transaction)
  const first = rows.slice(0, ROWS_PER_BATCH)
  await db.batch([db.prepare('DELETE FROM refs WHERE provider = ?1').bind(request.provider), ...first])
  for (let i = ROWS_PER_BATCH; i < rows.length; i += ROWS_PER_BATCH) await db.batch(rows.slice(i, i + ROWS_PER_BATCH))
  return rows.length
}

/** {@return every reference id, by provider and kind} */
export async function refIndex(db: D1Database): Promise<RefIndex> {
  const result = await db.prepare('SELECT provider, kind, id FROM refs ORDER BY provider, kind, id')
    .all<{ provider: string; kind: string; id: string }>()
  const index: RefIndex = {}
  for (const row of result.results) ((index[row.provider] ??= {})[row.kind] ??= []).push(row.id)
  return index
}

/** {@return the display names of the ids that have one, by provider, kind and id} */
export async function refLabels(db: D1Database): Promise<RefLabels> {
  const result = await db.prepare('SELECT provider, kind, id, label FROM refs WHERE label IS NOT NULL ORDER BY provider, kind, id')
    .all<{ provider: string; kind: string; id: string; label: string }>()
  const labels: RefLabels = {}
  for (const row of result.results) ((labels[row.provider] ??= {})[row.kind] ??= {})[row.id] = row.label
  return labels
}
