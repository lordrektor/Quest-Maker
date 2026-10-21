/**
 * Where parts sit when nobody placed them: inside a quest box, requirements | Start | stages with their objectives
 * below | Finish | rewards, the fail rules underneath; on the workspace, quests left to right along their lines.
 * Deterministic: the same quest always lays out the same way.
 */
import { CALLBACK_EVENTS } from '../../shared/quest/canonical'
import type { Nid, QuestModel } from './model'
import type { Box, WorkspaceModel } from './workspace'
import { inRewardRequirements } from './ops'
import { links } from './workspace'

export type Point = { x: number; y: number }

/** Node sizes, as the canvas draws them. */
export const SIZE = {
  entry: { w: 220, h: 64 },
  stage: { w: 180, h: 56 },
  start: { w: 220, h: 92 },
  finish: { w: 180, h: 56 },
  fail: { w: 200, h: 76 },
  callbacks: { w: 200, h: 150 },
}
/** A group of requirements: its requirements sit inside it, one under the other. */
export const GROUP = { w: 240, header: 44, pad: 10, row: 76 }
const COLUMN = 250
const ROW = 80
/** Room between parts wired side by side, so the line between them is long enough to see. */
const LINK = 100
/** Space inside a box around its parts, and its title bar. */
export const BOX_PADDING = 24
export const BOX_HEADER = 48
/** A closed box: a card. */
export const CARD = { w: 340, h: 104 }

/** {@return true when a quest's Callbacks node is on the canvas: added, or holding an action} */
export function callbacksShown(model: QuestModel): boolean {
  return model.callbacksShown || CALLBACK_EVENTS.some((event) => model.callbacks[event].length > 0)
}

/** {@return the height of a group holding some requirements (room for one when empty)} */
export function groupHeight(members: number): number {
  return GROUP.header + Math.max(1, members) * GROUP.row - (GROUP.row - SIZE.entry.h) + GROUP.pad
}

/** {@return the room a requirement or group takes in a column, with the space under it} */
function rowHeight(model: QuestModel, nid: Nid): number {
  return model.entries[nid]?.members ? partSize(model, nid).h + ROW - SIZE.entry.h : ROW
}

/** Room between two parts one under the other inside a group. */
const GROUP_GAP = GROUP.row - SIZE.entry.h

/** {@return where the j-th requirement of a group of requirements sits, from the group's corner} */
export function memberOffset(j: number): Point {
  return { x: GROUP.pad, y: GROUP.header + j * GROUP.row }
}

/** {@return where each member of a group sits, from the group's corner: one under the other, a group as tall as its own} */
export function memberOffsets(model: QuestModel, nid: Nid): Point[] {
  let y = GROUP.header
  return (model.entries[nid]?.members ?? []).map((m) => {
    const at = { x: GROUP.pad, y }
    y += partSize(model, m).h + GROUP_GAP
    return at
  })
}

/** {@return the positions with every group's members inside their group, in its order (groups in groups too)} */
export function withGroups(model: QuestModel, positions: Record<string, Point>): Record<string, Point> {
  const inside = new Set(Object.values(model.entries).flatMap((e) => e.members ?? []))
  let out = positions
  const place = (nid: Nid, at: Point) => {
    const offsets = memberOffsets(model, nid)
    model.entries[nid]!.members!.forEach((m, j) => {
      out[m] = { x: at.x + offsets[j]!.x, y: at.y + offsets[j]!.y }
      if (model.entries[m]?.members) place(m, out[m]!)
    })
  }
  for (const entry of Object.values(model.entries)) {
    const at = positions[entry.nid]
    if (!entry.members || !at || inside.has(entry.nid)) continue
    if (out === positions) out = { ...positions }
    place(entry.nid, at)
  }
  return out
}

/** {@return a position for every part of a quest (keys: start, finish, fail, callbacks and the nids)} */
export function autoLayout(model: QuestModel): Record<string, Point> {
  const at: Record<string, Point> = {}
  // Stage rewards sit above their stage: the chain row moves down to make room
  const topRows = Math.max(0, ...model.chain.map((nid) => model.stages[nid]!.rewards.length + model.stages[nid]!.callbacks.length))
  const top = topRows > 0 ? topRows * ROW + 10 : 0
  let requirementsY = top
  for (const nid of model.requirements) {
    at[nid] = { x: 0, y: requirementsY }
    requirementsY += rowHeight(model, nid)
  }
  // Requirements (and fail.unless) sit in a column on the left, wired to the Start (and the fail rules) right of them
  const leftColumn = [...model.requirements, ...model.fail.unless]
  const startX = leftColumn.length > 0 ? Math.max(...leftColumn.map((nid) => partSize(model, nid).w)) + LINK : 0
  at.start = { x: startX, y: top }
  let bottom = top + Math.max(SIZE.start.h, requirementsY - top)
  const stageX = (i: number) => startX + SIZE.start.w + LINK + i * (SIZE.stage.w + LINK)
  model.chain.forEach((stageNid, i) => {
    const x = stageX(i)
    const stage = model.stages[stageNid]!
    at[stageNid] = { x, y: top }
    // Above the stage: its rewards, then its callbacks
    const above = [...stage.rewards, ...stage.callbacks]
    above.forEach((nid, j) => (at[nid] = { x: x - 20, y: top - (above.length - j) * ROW }))
    // Each objective, then its own rewards and callbacks under it (indented)
    let y = top + 90
    for (const nid of stage.objectives) {
      at[nid] = { x: x - 20, y }
      y += ROW
      for (const r of [...(model.entries[nid]?.rewards ?? []), ...(model.entries[nid]?.callbacks ?? [])]) {
        at[r] = { x: x + 10, y }
        y += ROW
      }
    }
    bottom = Math.max(bottom, y)
  })
  const finishX = stageX(model.chain.length)
  at.finish = { x: finishX, y: top }
  model.rewards.forEach((nid, i) => (at[nid] = { x: finishX + SIZE.finish.w + LINK, y: top + i * ROW }))
  bottom = Math.max(bottom, top + model.rewards.length * ROW)

  let next = bottom + 60
  if (model.fail.shown || model.fail.when.length > 0 || model.fail.unless.length > 0 || model.fail.actions.length > 0) {
    const failY = next
    at.fail = { x: startX, y: failY }
    let unlessY = failY + SIZE.fail.h + 30
    for (const nid of model.fail.unless) {
      at[nid] = { x: 0, y: unlessY }
      unlessY += rowHeight(model, nid)
    }
    const failRight = startX + SIZE.fail.w + LINK
    model.fail.when.forEach((nid, i) => (at[nid] = { x: failRight + COLUMN * i, y: failY }))
    // What failing does, under the fail rules
    model.fail.actions.forEach((nid, i) => (at[nid] = { x: failRight + COLUMN * i, y: failY + SIZE.fail.h + 30 }))
    next = failY + SIZE.fail.h + 30 + Math.max(ROW, unlessY - (failY + SIZE.fail.h + 30), model.fail.actions.length > 0 ? ROW : 0)
  }
  if (callbacksShown(model)) {
    // The Callbacks node, each event's actions in a row to its right
    const callbacksY = next
    at.callbacks = { x: startX, y: callbacksY }
    let row = 0
    for (const event of CALLBACK_EVENTS) {
      const actions = model.callbacks[event]
      if (actions.length === 0) continue
      actions.forEach((nid, i) => (at[nid] = { x: startX + SIZE.callbacks.w + LINK + COLUMN * i, y: callbacksY + row * ROW }))
      row++
    }
    next = callbacksY + Math.max(SIZE.callbacks.h, row * ROW) + 40
  }
  // Loose parts last, in a row, so they are easy to find
  let looseX = 0
  for (const nid of model.loose) {
    at[nid] = { x: looseX, y: next }
    looseX += COLUMN
  }
  for (const nid of model.loose) {
    // A loose objective's rewards and callbacks under it
    ;[...(model.entries[nid]?.rewards ?? []), ...(model.entries[nid]?.callbacks ?? [])]
      .forEach((r, j) => (at[r] = { x: at[nid]!.x + 30, y: next + (j + 1) * ROW }))
  }
  for (const stage of Object.values(model.stages)) {
    if (model.chain.includes(stage.nid)) continue
    at[stage.nid] = { x: looseX, y: next }
    let y = next + 90
    for (const nid of [...stage.objectives, ...stage.rewards, ...stage.callbacks]) {
      at[nid] = { x: Math.max(0, looseX - 20), y }
      y += ROW
      for (const r of [...(model.entries[nid]?.rewards ?? []), ...(model.entries[nid]?.callbacks ?? [])]) {
        at[r] = { x: looseX + 10, y }
        y += ROW
      }
    }
    looseX += COLUMN
  }
  return withGroups(model, at)
}

/** Gives a position to every part that has none (a new one), where the auto-layout would put it. */
export function placeMissing(model: QuestModel, positions: Record<Nid, Point>): Record<Nid, Point> {
  const keys = ['start', 'finish', ...(model.fail.shown || model.fail.when.length + model.fail.unless.length + model.fail.actions.length > 0 ? ['fail'] : []),
    ...(callbacksShown(model) ? ['callbacks'] : []), ...Object.keys(model.stages), ...Object.keys(model.entries).filter((k) => !inRewardRequirements(model, k))]
  if (keys.every((k) => positions[k])) return positions
  const auto = autoLayout(model)
  const out = { ...positions }
  for (const key of keys) if (!out[key] && auto[key]) out[key] = auto[key]
  return out
}

/** {@return the size of an open box around its parts (parts sit at x, y >= 0 inside it); groups are sized by the model} */
export function boxSize(positions: Record<string, Point>, model?: QuestModel): { width: number; height: number } {
  let maxX = CARD.w - 2 * BOX_PADDING
  let maxY = 40
  for (const [key, p] of Object.entries(positions)) {
    const size = model ? partSize(model, key) : sizeOf(key)
    maxX = Math.max(maxX, Math.max(0, p.x) + size.w)
    maxY = Math.max(maxY, Math.max(0, p.y) + size.h)
  }
  return { width: maxX + 2 * BOX_PADDING, height: maxY + 2 * BOX_PADDING + BOX_HEADER }
}

/** The smallest height of an open box: its title bar and one row (as boxSize). */
const BOX_MIN_HEIGHT = 40 + 2 * BOX_PADDING + BOX_HEADER

/** The smallest size an open box takes when dragged by each edge (width for left / right, height for top / bottom). */
export interface BoxLimits {
  right: number
  bottom: number
  left: number
  top: number
}

/** {@return how far a box's parts sit from its content's top-left corner: the room a left or top edge can take in} */
export function partOffset(positions: Record<string, Point>): Point {
  const all = Object.values(positions)
  if (all.length === 0) return { x: 0, y: 0 }
  return { x: Math.max(0, Math.min(...all.map((p) => p.x))), y: Math.max(0, Math.min(...all.map((p) => p.y))) }
}

/**
 * {@return the smallest width and height an open box can take by each edge, at its drawn size}: the right and
 * bottom edges stop at the parts' far side; the left and top edges, the far edges staying still, at their near side
 */
export function resizeLimits(positions: Record<string, Point>, model: QuestModel | undefined,
                             size: { width: number; height: number }): BoxLimits {
  const min = boxSize(positions, model)
  const offset = partOffset(positions)
  return {
    right: min.width,
    bottom: min.height,
    left: Math.max(size.width - offset.x, CARD.w),
    top: Math.max(size.height - offset.y, BOX_MIN_HEIGHT),
  }
}

/**
 * {@return a box resized from any edge or corner, with its parts' new positions inside it}
 *
 * A left or top edge moves the box, and its parts move back by as much: they stay where they are on the workspace.
 * An edge never goes past a part. At (or below) the size its parts need, the box goes back to fitting them.
 *
 * @param box       The box before.
 * @param positions Where its parts sit inside it.
 * @param next      The box's place and size as dragged.
 */
export function resizedBox(box: Box, positions: Record<string, Point>, model: QuestModel | undefined,
                           next: { x: number; y: number; width: number; height: number }): { box: Box; positions: Record<string, Point> } {
  const offset = partOffset(positions)
  // The far edges stay where they were dragged to; the near ones stop at the parts
  const right = next.x + next.width
  const bottom = next.y + next.height
  const dx = Math.min(Math.round(next.x - box.x), offset.x)
  const dy = Math.min(Math.round(next.y - box.y), offset.y)
  const moved = dx === 0 && dy === 0 ? positions
    : Object.fromEntries(Object.entries(positions).map(([key, p]) => [key, { x: p.x - dx, y: p.y - dy }]))
  const x = box.x + dx
  const y = box.y + dy
  const min = boxSize(moved, model)
  const width = right - x
  const height = bottom - y
  const resized: Box = { x, y, open: box.open }
  if (width > min.width + 4) resized.w = Math.round(width)
  if (height > min.height + 4) resized.h = Math.round(height)
  return { box: resized, positions: moved }
}

/** Where a box's content starts inside it. */
export const BOX_OFFSET = { x: BOX_PADDING, y: BOX_HEADER + BOX_PADDING }

/** {@return the size a part of a quest is drawn at (a group grows with its requirements)} */
export function partSize(model: QuestModel, key: string): { w: number; h: number } {
  const members = model.entries[key]?.members?.filter((m) => model.entries[m])
  if (!members) return sizeOf(key)
  // Its members one under the other (room for one when empty), a group inside it as big as its own
  const sizes = members.map((m) => partSize(model, m))
  const width = Math.max(SIZE.entry.w, ...sizes.map((s) => s.w)) + 2 * GROUP.pad
  const inner = sizes.length === 0 ? SIZE.entry.h : sizes.reduce((sum, s) => sum + s.h, 0) + GROUP_GAP * (sizes.length - 1)
  return { w: width, h: GROUP.header + inner + GROUP.pad }
}

/** {@return the size a part is drawn at} */
export function sizeOf(key: string): { w: number; h: number } {
  if (key === 'start') return SIZE.start
  if (key === 'finish') return SIZE.finish
  if (key === 'fail') return SIZE.fail
  if (key === 'callbacks') return SIZE.callbacks
  if (key.startsWith('stage')) return SIZE.stage
  return SIZE.entry
}

/**
 * {@return where each quest box goes: in columns along the lines (a quest right of the ones that start or unlock it)}
 *
 * @param sizes Each box's size.
 */
export function layoutBoxes(ws: WorkspaceModel, sizes: Record<string, { width: number; height: number }>): Record<string, Box> {
  const depth = new Map<string, number>()
  const incoming = new Map<string, string[]>()
  for (const l of links(ws)) {
    if (!ws.quests[l.from] || !ws.quests[l.to] || l.from === l.to) continue
    ;(incoming.get(l.to) ?? incoming.set(l.to, []).get(l.to)!).push(l.from)
  }
  const visit = (id: string, path: Set<string>): number => {
    const known = depth.get(id)
    if (known !== undefined) return known
    if (path.has(id)) return 0
    path.add(id)
    let d = 0
    for (const from of incoming.get(id) ?? []) d = Math.max(d, visit(from, path) + 1)
    path.delete(id)
    depth.set(id, d)
    return d
  }
  ws.order.forEach((id) => visit(id, new Set()))
  const columns: string[][] = []
  for (const id of ws.order) (columns[depth.get(id) ?? 0] ??= []).push(id)
  const boxes: Record<string, Box> = {}
  let x = 0
  for (const column of columns) {
    if (!column) continue
    let y = 0
    let width = 0
    for (const id of column) {
      const size = sizes[id] ?? { width: CARD.w, height: CARD.h }
      boxes[id] = { x, y, open: ws.boxes[id]?.open ?? true }
      y += size.height + 80
      width = Math.max(width, size.width)
    }
    x += width + 140
  }
  return boxes
}
