/** The creator's calls to the Worker (/api/creator/...). The web writes only there, in D1. */
import { ApiError, get } from '../api'
import { signedOut } from '../auth'
import type { CatalogResponse, QuestDoc, SaveRequest, SaveResponse, WorkspaceDoc, WorkspaceSummary } from '../../shared/creator'

export function fetchCatalog(signal?: AbortSignal): Promise<CatalogResponse> {
  return get<CatalogResponse>('creator/catalog', signal)
}

/** {@return the signed-in person's own workspaces (the ones they created), the latest first} */
export async function fetchMyWorkspaces(signal?: AbortSignal): Promise<WorkspaceSummary[]> {
  return (await get<{ workspaces: WorkspaceSummary[] }>('creator/workspaces', signal)).workspaces
}

/** {@return the workspace, or null when there is none of that name yet} */
export async function fetchWorkspace(name: string, signal?: AbortSignal): Promise<WorkspaceDoc | null> {
  try {
    return (await get<{ workspace: WorkspaceDoc }>(`creator/workspaces/${encodeURIComponent(name)}`, signal)).workspace
  } catch (e) {
    if (e instanceof ApiError && e.notFound) return null
    throw e
  }
}

/** {@return the quests by id (at most 50 a call), and the ids not in D1} */
export async function fetchQuests(ids: string[], signal?: AbortSignal): Promise<{ quests: QuestDoc[]; missing: string[] }> {
  if (ids.length === 0) return { quests: [], missing: [] }
  const quests: QuestDoc[] = []
  const missing: string[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const part = await get<{ quests: QuestDoc[]; missing: string[] }>(`creator/quests?ids=${ids.slice(i, i + 50).join(',')}`, signal)
    quests.push(...part.quests)
    missing.push(...part.missing)
  }
  return { quests, missing }
}

/** {@return whether a quest exists in D1, and its name} */
export function fetchSummary(id: string, signal?: AbortSignal): Promise<{ exists: boolean; name: string | null }> {
  return get(`creator/quests/${encodeURIComponent(id)}/summary`, signal)
}

/** Saves; every answer comes back as the response body (409 and 422 included), other failures throw. */
/**
 * Deletes a quest from the database (chronos.cloudflare.delete): it is gone from the website at once, and the game
 * deletes it at its next /chronos cl download. A quest that is already gone counts as deleted.
 *
 * @param workspace The workspace it is deleted from: downloading that workspace takes the delete too.
 */
export async function deleteQuest(id: string, workspace: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`/api/creator/quests/${encodeURIComponent(id)}/delete`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ workspace }),
    })
  } catch {
    throw new ApiError(0, 'The server could not be reached; nothing was deleted.')
  }
  if (response.status === 401) signedOut()
  if (response.ok || response.status === 404) return
  const body = (await response.json().catch(() => null)) as { error?: string } | null
  throw new ApiError(response.status, body?.error || `HTTP ${response.status}`)
}

export async function save(request: SaveRequest): Promise<SaveResponse> {
  let response: Response
  try {
    response = await fetch('/api/creator/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw new ApiError(0, 'The server could not be reached; your changes are kept in this browser.')
  }
  const body = (await response.json().catch(() => null)) as SaveResponse | { ok: false; error: string } | null
  if (response.status === 401) signedOut()
  if (response.ok || response.status === 409 || response.status === 422) {
    if (body) return body as SaveResponse
  }
  throw new ApiError(response.status, (body && 'error' in body && body.error) || `HTTP ${response.status}`)
}
