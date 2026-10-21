/**
 * The contract between the Chronos plugin, the Worker and the site.
 *
 * Plugin → Worker: `POST /chronos/v1/<action>` with a JSON body and three headers:
 *   X-Chronos-Timestamp  the sender's clock, epoch milliseconds
 *   X-Chronos-Signature  lowercase hex HMAC-SHA256 of `${timestamp}.${body}` with the shared secret
 *   X-Chronos-Server     the server's name (informational)
 * A request whose timestamp is more than MAX_CLOCK_SKEW_MS away, or whose signature does not match, is refused
 * with 401. Every answer is JSON: `{ ok: true, ... }` or `{ ok: false, error }`.
 *
 * Site → Worker: `/api/auth/...` (the login) and `/api/creator/...` (the creator, shared/creator.ts), with the
 * session cookie. The site writes only to D1, never to a game server.
 */

/** Quests and pools, as Chronos stores them. */
export type Kind = 'quest' | 'pool'

/** A definition: its canonical tree, the same shape as its YAML file. */
export interface DefinitionRow {
  kind: Kind
  id: string
  /** The definition tree (quest or pool keys). */
  body: Record<string, unknown>
  /** The version in the sending server's store. */
  version: number
  updatedAt: number
  updatedBy: string | null
  /** Who wrote it last: the plugin (`server`) or the web creator (`web`). */
  source?: 'server' | 'web'
  /** The server that sent it. */
  server?: string | null
  /** Deleted on the website: the game deletes it at its next download (only with withDeletes). */
  deleted?: true
}

export interface UpsertRequest {
  server: string
  items: DefinitionRow[]
  /** Also replace definitions saved on the web since the game's last download (cl export ... force). */
  overwriteWeb?: boolean
}

export interface FetchRequest {
  kind: Kind
  /** null: every definition of that kind. */
  ids: string[] | null
  /** Also the ones deleted on the website, as { deleted: true } rows (a plugin that applies deletes asks for them). */
  withDeletes?: boolean
}

/** The game deleted these (/chronos editor): the Worker drops its copies, except ones edited on the web since. */
export interface DeleteRequest {
  kind: Kind
  ids: string[]
}

/** deleted: copies dropped; kept: copies saved on the web since the game's last download, left as they were. */
export type DeleteResponse = Ok<{ deleted: string[]; kept: string[] }> | Failed

export interface OtpCreateRequest {
  ownerType: 'player' | 'console'
  ownerUuid: string | null
  ownerName: string
  validitySeconds: number
  /** The player may delete quests on the website (chronos.cloudflare.delete). */
  canDelete?: boolean
}

export interface RefsReplaceRequest {
  /** vulcan, tyche, exptailor, chrysos, kleos, crius, metabasis, convo, plutus or phantasos. */
  provider: string
  /**
   * An id may be a path when its kind lives under another (Convo: convos `guard/intro`, answers
   * `guard/intro/accept`); label is a display name (at most 128 characters), or none.
   */
  refs: { kind: string; id: string; label?: string | null }[]
}

export type Ok<T> = { ok: true } & T
export type Failed = { ok: false; error: string }

/** skipped: ids saved on the web since the game's last download, left as they were. */
export type UpsertResponse = Ok<{ written: number; skipped: string[] }> | Failed
export type FetchResponse = Ok<{ items: DefinitionRow[] }> | Failed
export type OtpCreateResponse = Ok<{ code: string; expiresAt: number }> | Failed
export type RefsReplaceResponse = Ok<{ written: number }> | Failed
export type StatusResponse = Ok<{
  schema: number
  counts: { quests: number; pools: number; refs: number; activeOtps: number; webPending: number; webDeleted: number; workspaces: number;
    catalogSyncedAt: number }
}> | Failed

/** Reference ids the plugin sent (`/chronos cl refs`), by provider and kind. */
export type RefIndex = Record<string, Record<string, string[]>>

/** The display names the plugin sent with its ids, by provider, kind and id (only ids that have one). */
export type RefLabels = Record<string, Record<string, Record<string, string>>>
