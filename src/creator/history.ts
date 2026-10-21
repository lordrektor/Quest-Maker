/** Undo and redo over whole snapshots of the workspace (it is small: a few quests). */

const LIMIT = 100

export class History<T> {
  private past: string[] = []
  private future: string[] = []

  /** Remembers the state before a change. */
  record(state: T) {
    const snapshot = JSON.stringify(state)
    if (this.past[this.past.length - 1] === snapshot) return
    this.past.push(snapshot)
    if (this.past.length > LIMIT) this.past.shift()
    this.future = []
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  /** {@return the state before the last change, or null} @param current The state now (kept for redo). */
  undo(current: T): T | null {
    const previous = this.past.pop()
    if (previous === undefined) return null
    this.future.push(JSON.stringify(current))
    return JSON.parse(previous) as T
  }

  /** {@return the state undo left, or null} @param current The state now (kept for undo). */
  redo(current: T): T | null {
    const next = this.future.pop()
    if (next === undefined) return null
    this.past.push(JSON.stringify(current))
    return JSON.parse(next) as T
  }

  clear() {
    this.past = []
    this.future = []
  }
}
