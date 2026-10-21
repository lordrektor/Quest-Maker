/**
 * Unsaved work, kept in this browser only (localStorage): a workspace and its quests as last edited. It can be
 * missing at any time (private windows, cleared data), so every read and write is allowed to fail.
 */
import type { WorkspaceModel } from './workspace'

const PREFIX = 'chronos.creator.draft.'

export interface Draft {
  ws: WorkspaceModel
  at: number
}

export function saveDraft(ws: WorkspaceModel) {
  try {
    localStorage.setItem(PREFIX + ws.name, JSON.stringify({ ws, at: Date.now() } satisfies Draft))
  } catch {
    // No storage here: the draft is only in this tab
  }
}

export function loadDraft(name: string): Draft | null {
  try {
    const raw = localStorage.getItem(PREFIX + name)
    if (!raw) return null
    const draft = JSON.parse(raw) as Draft
    return draft && typeof draft.at === 'number' && draft.ws?.name === name ? draft : null
  } catch {
    return null
  }
}

export function dropDraft(name: string) {
  try {
    localStorage.removeItem(PREFIX + name)
  } catch {
    // Nothing kept
  }
}
