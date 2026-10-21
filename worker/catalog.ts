import { CATALOG_SECTIONS, type CatalogSection } from '../shared/creator'
import { HttpError } from './http'

/** A D1 row holds about 2 MB; the plugin refuses sections over 1.5 MB. */
export const MAX_SECTION_BYTES = 1_900_000

export interface CatalogReplace {
  section: CatalogSection
  body: Record<string, unknown>
  server: string | null
}

/** {@return the replace request (one section of /chronos cl types), checked} */
export function readCatalog(body: Record<string, unknown>): CatalogReplace {
  const section = body.section
  if (typeof section !== 'string' || !(CATALOG_SECTIONS as readonly string[]).includes(section)) {
    throw new HttpError(400, `section must be one of ${CATALOG_SECTIONS.join(', ')}`)
  }
  const value = body.body
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, 'body must be an object')
  if (new TextEncoder().encode(JSON.stringify(value)).length > MAX_SECTION_BYTES) {
    throw new HttpError(413, `the ${section} section is larger than ${MAX_SECTION_BYTES / 1000} KB`)
  }
  return { section: section as CatalogSection, body: value as Record<string, unknown>, server: typeof body.server === 'string' ? body.server : null }
}

/** Replaces one section. */
export async function replaceCatalog(db: D1Database, request: CatalogReplace, now: number): Promise<void> {
  await db.prepare('INSERT OR REPLACE INTO catalog (section, body, synced_at, server) VALUES (?1, ?2, ?3, ?4)')
    .bind(request.section, JSON.stringify(request.body), now, request.server).run()
}

/** {@return every section the plugin sent, and when} */
export async function loadCatalog(db: D1Database): Promise<{ sections: Partial<Record<CatalogSection, unknown>>; syncedAt: Partial<Record<CatalogSection, number>> }> {
  const rows = await db.prepare('SELECT section, body, synced_at FROM catalog').all<{ section: CatalogSection; body: string; synced_at: number }>()
  const sections: Partial<Record<CatalogSection, unknown>> = {}
  const syncedAt: Partial<Record<CatalogSection, number>> = {}
  for (const row of rows.results) {
    sections[row.section] = JSON.parse(row.body)
    syncedAt[row.section] = row.synced_at
  }
  return { sections, syncedAt }
}
