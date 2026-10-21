/**
 * The workspace as Vue Flow nodes and edges, and a drawn connection read back as an edit. Node ids:
 *   q|<quest>          a quest box (a group; its parts sit inside it)
 *   p|<quest>|<key>    a part: start, finish, fail, a stage or an entry (key = its nid); a group of requirements holds
 *                      its requirements' nodes (they are drawn inside it, in its order)
 *   g|<quest>          a quest named by the workspace's quests but not on it
 * The canvas never holds state of its own: positions and connections go back into the workspace model.
 */
import { CALLBACK_EVENTS, type CallbackEvent, MAX_GROUP_LEVEL } from '../../../shared/quest/canonical'
import type { Catalog } from '../../../shared/creator'
import { MarkerType, Position, type Connection, type Edge, type Node } from '@vue-flow/core'
import type { Checked } from '../problems'
import { levelOf } from '../problems'
import { BOX_OFFSET, type BoxLimits, boxSize, callbacksShown, CARD, placeMissing, type Point, resizeLimits, withGroups } from '../layout'
import { type EntryModel, isGroupEntry, type Nid, type Parent, type QuestModel } from '../model'
import { groupLevel, inRewardRequirements, parentOf, refusal } from '../ops'
import { ghosts, linkRefusal, links, type LinkKind, type WorkspaceModel } from '../workspace'

export type PartKind = 'start' | 'stage' | 'finish' | 'fail' | 'callbacks' | 'entry'

export interface BoxData {
  quest: string
  /** The smallest size it takes by each edge: right and bottom stop at its parts' far side, left and top at their near side. */
  limits: BoxLimits
  /** Selected in the editor (the inspector shows it). */
  chosen?: boolean
  open: boolean
  level: 'error' | 'warning' | null
}

export interface PartData {
  quest: string
  /** Where it is on the canvas (for a part moving into or out of a group, see WorkspaceCanvas). */
  at?: Point
  chosen?: boolean
  key: string
  level: 'error' | 'warning' | null
  loose: boolean
}

export interface GhostData {
  quest: string
  chosen?: boolean
}

export const boxId = (quest: string) => `q|${quest}`
export const partId = (quest: string, key: string) => `p|${quest}|${key}`
export const ghostId = (quest: string) => `g|${quest}`

export type NodeRef =
  | { kind: 'box'; quest: string }
  | { kind: 'part'; quest: string; key: string }
  | { kind: 'ghost'; quest: string }

export function parseId(id: string): NodeRef | null {
  const [kind, quest, ...rest] = id.split('|')
  if (!quest) return null
  if (kind === 'q') return { kind: 'box', quest }
  if (kind === 'g') return { kind: 'ghost', quest }
  if (kind === 'p' && rest.length > 0) return { kind: 'part', quest, key: rest.join('|') }
  return null
}

/** {@return what kind of part a key names} */
export function partKind(model: QuestModel, key: string): PartKind | null {
  if (key === 'start' || key === 'finish' || key === 'fail' || key === 'callbacks') return key
  if (model.stages[key]) return 'stage'
  if (model.entries[key]) return 'entry'
  return null
}

/** {@return the size a quest's box is drawn at: its parts' size, or more when resized; a card when closed} */
export function drawnSize(ws: WorkspaceModel, id: string): { width: number; height: number } {
  const box = ws.boxes[id]
  const state = ws.quests[id]
  if (!box || !state || !box.open) return { width: CARD.w, height: CARD.h }
  const min = boxSize(partPositions(state.model, state.positions), state.model)
  return { width: Math.max(min.width, box.w ?? 0), height: Math.max(min.height, box.h ?? 0) }
}

/** {@return where each part of a quest is drawn inside its box (missing ones placed by the auto-layout)} */
export function partPositions(model: QuestModel, positions: Record<Nid, Point>): Record<string, Point> {
  const all = placeMissing(model, positions)
  // A reward's requirements are not drawn (its line says them)
  const keys = new Set(['start', 'finish', ...Object.keys(model.stages), ...Object.keys(model.entries).filter((k) => !inRewardRequirements(model, k))])
  if (model.fail.shown || model.fail.when.length + model.fail.unless.length + model.fail.actions.length > 0) keys.add('fail')
  if (callbacksShown(model)) keys.add('callbacks')
  const out: Record<string, Point> = {}
  for (const key of keys) {
    const p = all[key]
    if (p) out[key] = { x: Math.max(0, p.x), y: Math.max(0, p.y) }
  }
  // A group's requirements always sit inside it
  return withGroups(model, out)
}

function entryHandle(model: QuestModel, entry: EntryModel): Position {
  // An objective's rewards sit under it, a stage's above it
  const parent = entry.category === 'reward' ? parentOf(model, entry.nid) : null
  if (parent?.kind === 'objective-rewards' || parent?.kind === 'objective-callbacks') return Position.Top
  if (parent?.kind === 'stage-rewards' || parent?.kind === 'stage-callbacks') return Position.Bottom
  return entry.category === 'objective' ? Position.Top : entry.category === 'requirement' ? Position.Right : Position.Left
}

/** {@return the handle of the place an entry sits in} */
function placeHandle(parent: Parent): { key: string; handle: string } {
  switch (parent.kind) {
    case 'stage':
      return { key: parent.stage, handle: 'obj' }
    case 'requirements':
      return { key: 'start', handle: 'req' }
    case 'rewards':
      return { key: 'finish', handle: 'rew' }
    case 'when':
      return { key: 'fail', handle: 'when' }
    case 'unless':
      return { key: 'fail', handle: 'unless' }
    case 'actions':
      return { key: 'fail', handle: 'then' }
    case 'objective-rewards':
      return { key: parent.objective, handle: 'rew' }
    case 'stage-rewards':
      return { key: parent.stage, handle: 'rew' }
    case 'callback':
      return { key: 'callbacks', handle: `cb-${parent.event}` }
    case 'objective-callbacks':
      return { key: parent.objective, handle: 'cb' }
    case 'stage-callbacks':
      return { key: parent.stage, handle: 'cb' }
    case 'group':
      return { key: parent.group, handle: 'req' }
    case 'reward-requirements':
      return { key: parent.reward, handle: 'out' }
  }
}

/** {@return true for the places of callbacks (their lines are violet and dotted)} */
function isCallback(parent: Parent): boolean {
  return parent.kind === 'callback' || parent.kind === 'objective-callbacks' || parent.kind === 'stage-callbacks'
}

const LINK_STYLE: Record<LinkKind, { stroke: string; dash?: string; label: string }> = {
  starts: { stroke: '#f5b83d', label: 'starts' },
  unlocks: { stroke: '#3fcf8e', dash: '6 4', label: 'unlocks' },
  fails: { stroke: '#f87171', label: 'on fail starts' },
  'fail-unlocks': { stroke: '#f87171', dash: '6 4', label: 'on fail unlocks' },
}

/** {@return the nodes and edges to draw} */
export function deriveFlow(ws: WorkspaceModel, checked: Checked): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []
  const sizes: Record<string, { width: number; height: number }> = {}
  for (const id of ws.order) {
    const state = ws.quests[id]!
    const box = ws.boxes[id]!
    const model = state.model
    const positions = partPositions(model, state.positions)
    const min = box.open ? boxSize(positions, model) : { width: CARD.w, height: CARD.h }
    const size = box.open ? { width: Math.max(min.width, box.w ?? 0), height: Math.max(min.height, box.h ?? 0) } : min
    sizes[id] = size
    const questProblems = checked.byPart.get(id)
    const level = questProblems && [...questProblems.values()].flat().some((p) => p.error) ? 'error'
      : questProblems && questProblems.size > 0 ? 'warning' : null
    nodes.push({
      id: boxId(id), type: 'quest', position: { x: box.x, y: box.y }, data: { quest: id, open: box.open, level, limits: resizeLimits(positions, model, size) } satisfies BoxData,
      width: size.width, height: size.height, connectable: true, dragHandle: '.box-handle', zIndex: 0,
    })
    if (!box.open) continue
    // Groups first, outer ones before the groups inside them: a node's parent must come before it
    const rank = (key: string) => (isGroupEntry(model.entries[key]) ? groupLevel(model, key) : MAX_GROUP_LEVEL + 1)
    const placed = Object.entries(positions).sort(([a], [b]) => rank(a) - rank(b))
    for (const [key, p] of placed) {
      const kind = partKind(model, key)
      if (!kind) continue
      const parent = kind === 'entry' ? parentOf(model, key) : null
      const loose = kind === 'entry' ? parent === null : kind === 'stage' ? !model.chain.includes(key) : false
      const group = isGroupEntry(model.entries[key])
      const holder = parent?.kind === 'group' ? positions[parent.group] : undefined
      const node: Node = {
        id: partId(id, key), type: group ? 'requirement-group' : kind,
        // A group's requirement is drawn inside the group, and can be dragged out of it
        ...(parent?.kind === 'group' && holder
          ? { parentNode: partId(id, parent.group), extent: undefined, expandParent: false, position: { x: p.x - holder.x, y: p.y - holder.y } }
          : { parentNode: boxId(id), extent: 'parent' as const, expandParent: true, position: { x: p.x + BOX_OFFSET.x, y: p.y + BOX_OFFSET.y } }),
        // Vue Flow keeps what a node object leaves out (Object.assign onto the node it had): a requirement moved into a
        // group would keep expandParent and stretch the group's frame past what is drawn, its dots far out. So every
        // part says all of them, and the size Vue Flow gave a frame while something was dragged is dropped.
        style: {}, width: undefined, height: undefined,
        data: { quest: id, key, level: levelOf(checked, id, key), loose, at: { x: box.x + BOX_OFFSET.x + p.x, y: box.y + BOX_OFFSET.y + p.y } } satisfies PartData,
        ...(kind === 'entry' ? { sourcePosition: entryHandle(model, model.entries[key]!) } : {}),
        deletable: kind !== 'start' && kind !== 'finish',
      }
      nodes.push(node)
    }
    // The stage chain
    const chain = ['start', ...model.chain, 'finish']
    for (let i = 0; i + 1 < chain.length; i++) {
      // Selecting a chain line and deleting it takes its stage off the chain (the one it leads to, or from, at the finish)
      const stage = chain[i + 1] !== 'finish' ? chain[i + 1]! : chain[i] !== 'start' ? chain[i]! : null
      edges.push({
        id: `c|${id}|${chain[i]}|${chain[i + 1]}`, source: partId(id, chain[i]!), target: partId(id, chain[i + 1]!), sourceHandle: 'next', targetHandle: 'prev',
        deletable: false, updatable: true, interactionWidth: 24, style: { stroke: '#8b95a4', strokeWidth: 2.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#8b95a4' },
        data: { chain: stage ? { quest: id, stage } : null },
      })
    }
    // Every entry to its place
    for (const nid of Object.keys(model.entries)) {
      const parent = parentOf(model, nid)
      // A group's requirements sit inside it, a reward's are in its line: no line
      if (!parent || parent.kind === 'group' || parent.kind === 'reward-requirements') continue
      const place = placeHandle(parent)
      edges.push({
        id: `e|${id}|${nid}`, source: partId(id, nid), target: partId(id, place.key), sourceHandle: 'out', targetHandle: place.handle,
        updatable: 'target', interactionWidth: 20,
        style: isCallback(parent) ? { stroke: '#a78bfa', strokeWidth: 1.5, strokeDasharray: '2 4' } : { stroke: '#3a4350', strokeWidth: 1.5 },
        data: { entry: { quest: id, nid } },
      })
    }
  }
  // Quests named but not on the workspace
  // Right of every box (never on top of one), level with the quest that names them
  const ghostIds = ghosts(ws)
  const right = ws.order.reduce((max, id) => Math.max(max, ws.boxes[id]!.x + (sizes[id]?.width ?? CARD.w)), 0)
  ghostIds.forEach((id, i) => {
    const holder = links(ws).find((l) => l.from === id || l.to === id)
    const near = holder ? ws.boxes[holder.holder] : undefined
    nodes.push({
      id: ghostId(id), type: 'ghost', data: { quest: id } satisfies GhostData,
      position: { x: right + 160, y: (near?.y ?? 0) + i * 90 }, deletable: false,
    })
  })
  // The lines between quests
  for (const l of links(ws)) {
    const style = LINK_STYLE[l.kind]
    const node = (q: string) => (ws.quests[q] ? boxId(q) : ghostId(q))
    edges.push({
      id: `l|${l.holder}|${l.nid}`, source: node(l.from), target: node(l.to), sourceHandle: ws.quests[l.from] ? l.kind : 'ghost-out',
      targetHandle: 'in', label: style.label, zIndex: 1000, updatable: true,
      style: { stroke: style.stroke, strokeWidth: 2.5, ...(style.dash ? { strokeDasharray: style.dash } : {}) },
      labelStyle: { fill: style.stroke, fontWeight: 600, fontSize: 12 }, labelBgStyle: { fill: '#0b0d11' },
      markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke },
      data: { holder: l.holder, nid: l.nid, kind: l.kind },
    })
  }
  return { nodes, edges }
}

/**
 * Before Vue Flow takes new nodes: a part moving into or out of a group (a new parent) changes its extent, and Vue Flow
 * then clamps it from where it had it, which is where it was let go; so it is told where the part goes first. Nothing
 * else is set: a part's z (above its box, which is lifted while selected) is Vue Flow's to keep.
 *
 * @param had The node Vue Flow has, by id.
 */
export function placeReparented(next: Node[], had: (id: string) => { parentNode?: string; computedPosition: { x: number; y: number; z?: number } } | undefined) {
  for (const node of next) {
    const old = had(node.id)
    const at = (node.data as PartData | undefined)?.at
    if (old && at && old.parentNode !== node.parentNode) old.computedPosition = { ...old.computedPosition, x: at.x, y: at.y }
  }
}

/** A line already drawn: a link between quests, a line of a stage chain, or an entry's line to its place. */
export type LineRef =
  | { kind: 'link'; holder: string; nid: Nid }
  | { kind: 'chain'; quest: string; stage: Nid | null }
  | { kind: 'entry'; quest: string; nid: Nid }

/** {@return what a drawn edge stands for} */
export function lineOf(edge: { id: string; data?: unknown }): LineRef | null {
  const data = edge.data as { holder?: string; nid?: string; chain?: { quest: string; stage: string } | null; entry?: { quest: string; nid: string } } | undefined
  if (data?.holder && data.nid) return { kind: 'link', holder: data.holder, nid: data.nid }
  if (data?.entry) return { kind: 'entry', quest: data.entry.quest, nid: data.entry.nid }
  if (edge.id.startsWith('c|')) return { kind: 'chain', quest: edge.id.split('|')[1]!, stage: data?.chain?.stage ?? null }
  return null
}

/** What a drawn connection does. */
export type ConnectAction =
  | { kind: 'link'; link: LinkKind; from: string; to: string }
  | { kind: 'attach'; quest: string; nid: Nid; parent: Parent }
  | { kind: 'chain'; quest: string; stage: Nid; after: Nid | null }
  | { kind: 'chain-end'; quest: string; stage: Nid }

/** {@return the edit a connection stands for, or why it does nothing} */
/** Handles a line ends at; a line drawn from one of these was drawn backwards. */
const TARGET_HANDLES = new Set(['prev', 'obj', 'req', 'rew', 'when', 'unless', 'then', 'in', 'cb', 'cb-start', 'cb-complete', 'cb-fail', 'cb-abandon', 'cb-expire'])

/** {@return the connection pointing the way the quest reads (a line drawn backwards turned around)} */
export function forwards(c: Connection): Connection {
  if (c.sourceHandle && TARGET_HANDLES.has(c.sourceHandle) && !(c.targetHandle && TARGET_HANDLES.has(c.targetHandle))) {
    return { source: c.target, sourceHandle: c.targetHandle, target: c.source, targetHandle: c.sourceHandle }
  }
  return c
}

export function interpret(ws: WorkspaceModel, drawn: Connection, catalog?: Catalog): { ok: true; action: ConnectAction } | { ok: false; why: string } {
  const c = forwards(drawn)
  const source = parseId(c.source)
  const target = parseId(c.target)
  if (!source || !target) return { ok: false, why: 'not a part of a quest' }
  if (source.kind === 'box' && (c.sourceHandle === 'starts' || c.sourceHandle === 'unlocks' || c.sourceHandle === 'fails'
    || c.sourceHandle === 'fail-unlocks')) {
    if (target.kind === 'part') return { ok: false, why: 'draw the line to the other quest\'s box' }
    const kind = c.sourceHandle as LinkKind
    const why = linkRefusal(ws, kind, source.quest, target.quest)
    if (why) return { ok: false, why: (kind === 'unlocks' || kind === 'fail-unlocks') && !ws.quests[target.quest] ? `add ${target.quest} to the workspace first` : why }
    return { ok: true, action: { kind: 'link', link: kind, from: source.quest, to: target.quest } }
  }
  if (source.kind !== 'part' || target.kind !== 'part') return { ok: false, why: 'connect parts of a quest, or a quest\'s starts/unlocks to another quest' }
  if (source.quest !== target.quest) return { ok: false, why: 'parts stay in their own quest' }
  const model = ws.quests[source.quest]?.model
  if (!model) return { ok: false, why: 'not on the workspace' }
  const sourceKind = partKind(model, source.key)
  const targetKind = partKind(model, target.key)
  if (sourceKind === 'entry') {
    const parent: Parent | null = targetKind === 'stage' && c.targetHandle === 'obj' ? { kind: 'stage', stage: target.key }
      : targetKind === 'stage' && c.targetHandle === 'rew' ? { kind: 'stage-rewards', stage: target.key }
      : targetKind === 'entry' && c.targetHandle === 'rew' ? { kind: 'objective-rewards', objective: target.key }
      : targetKind === 'stage' && c.targetHandle === 'cb' ? { kind: 'stage-callbacks', stage: target.key }
      : targetKind === 'entry' && c.targetHandle === 'cb' ? { kind: 'objective-callbacks', objective: target.key }
      : targetKind === 'callbacks' && c.targetHandle?.startsWith('cb-') && (CALLBACK_EVENTS as readonly string[]).includes(c.targetHandle.slice(3))
        ? { kind: 'callback', event: c.targetHandle.slice(3) as CallbackEvent }
      : targetKind === 'entry' && c.targetHandle === 'req' && isGroupEntry(model.entries[target.key]) ? { kind: 'group', group: target.key }
      : targetKind === 'start' && c.targetHandle === 'req' ? { kind: 'requirements' }
        : targetKind === 'finish' && c.targetHandle === 'rew' ? { kind: 'rewards' }
          : targetKind === 'fail' && (c.targetHandle === 'when' || c.targetHandle === 'unless') ? { kind: c.targetHandle }
            : targetKind === 'fail' && c.targetHandle === 'then' ? { kind: 'actions' as const }
              : null
    if (!parent) return { ok: false, why: 'connect it to a stage, an objective, the start, a group, the finish, the fail rules or the callbacks' }
    const why = refusal(model, source.key, parent, catalog)
    return why ? { ok: false, why } : { ok: true, action: { kind: 'attach', quest: source.quest, nid: source.key, parent } }
  }
  if (c.sourceHandle === 'next' && c.targetHandle === 'prev') {
    if (sourceKind === 'start' && targetKind === 'stage') return { ok: true, action: { kind: 'chain', quest: source.quest, stage: target.key, after: null } }
    if (sourceKind === 'stage' && targetKind === 'stage' && source.key !== target.key) {
      if (model.chain.includes(source.key)) return { ok: true, action: { kind: 'chain', quest: source.quest, stage: target.key, after: source.key } }
      // A loose stage drawn into the chain: it goes right before the stage it points at
      if (model.chain.includes(target.key)) {
        const before = model.chain[model.chain.indexOf(target.key) - 1] ?? null
        return { ok: true, action: { kind: 'chain', quest: source.quest, stage: source.key, after: before } }
      }
      return { ok: false, why: 'neither stage is on the chain: connect one to Start or to a stage on it first' }
    }
    if (sourceKind === 'stage' && targetKind === 'finish') return { ok: true, action: { kind: 'chain-end', quest: source.quest, stage: source.key } }
    if (sourceKind === 'start' && targetKind === 'finish') return { ok: false, why: 'stages go between Start and Finish: draw the line to a stage' }
  }
  return { ok: false, why: 'that connection means nothing in a quest' }
}
