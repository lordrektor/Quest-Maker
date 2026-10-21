import { describe, expect, it } from 'vitest'
import type { Node } from '@vue-flow/core'
import { deriveFlow, type PartData, partPositions, placeReparented } from '../src/creator/canvas/flow'
import { BOX_OFFSET } from '../src/creator/layout'
import { attach, leaveGroup } from '../src/creator/ops'
import { checkWorkspace } from '../src/creator/problems'
import { emptyWorkspace, loadedQuest, putQuest, type WorkspaceModel } from '../src/creator/workspace'

/** A quest with a requirement wired to the Start, an any group of two, and a group inside it. */
const BODY = {
  id: 'q', name: 'Q', pool: 'p',
  requirements: [
    { type: 'level', min: 5 },
    { any: [{ type: 'effect', effect: 'x' }, { type: 'effect', effect: 'y' }, { all: [{ type: 'level', min: 1 }, { type: 'level', min: 2 }] }] },
  ],
  objectives: { o: { type: 'fish', amount: 1 } },
}

function workspace(): WorkspaceModel {
  const ws = emptyWorkspace('w')
  putQuest(ws, loadedQuest({ id: 'q', body: BODY, layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }), { x: 100, y: 50 })
  return ws
}
const nodesOf = (ws: WorkspaceModel) => new Map(deriveFlow(ws, checkWorkspace(ws, null, () => undefined)).nodes.map((n) => [n.id, n]))
const edgesOf = (ws: WorkspaceModel) => deriveFlow(ws, checkWorkspace(ws, null, () => undefined)).edges.map((e) => e.id)

/** What Vue Flow does with a node object when it had that node already: Object.assign onto it (parseNode). */
const merged = (before: Node, after: Node) => Object.assign(structuredClone(before), after)

describe('requirements moving into and out of groups on the canvas', () => {
  it('a part in a group: its group is its parent, no extent, no growing its parent, no line of its own', () => {
    const nodes = nodesOf(workspace())
    expect(nodes.get('p|q|req:1:0')).toMatchObject({ parentNode: 'p|q|req:1', expandParent: false, position: { x: 10, y: 44 } })
    expect('extent' in nodes.get('p|q|req:1:0')!).toBe(true)
    expect(nodes.get('p|q|req:1:0')!.extent).toBeUndefined()
    expect(nodes.get('p|q|req:1:2')).toMatchObject({ type: 'requirement-group', parentNode: 'p|q|req:1', expandParent: false })
    expect(nodes.get('p|q|req:1:2:0')).toMatchObject({ parentNode: 'p|q|req:1:2', expandParent: false })
    // Outside a group: in the box, kept in it, growing it
    expect(nodes.get('p|q|req:0')).toMatchObject({ parentNode: 'q|q', extent: 'parent', expandParent: true })
    expect(edgesOf(workspace()).filter((e) => e.startsWith('e|q|req')).sort()).toEqual(['e|q|req:0', 'e|q|req:1'])
  })

  it('every part says all of what Vue Flow would otherwise keep: a requirement moved into a group does not stretch it', () => {
    const ws = workspace()
    const before = nodesOf(ws).get('p|q|req:0')!
    // Vue Flow grew a frame while something was dragged
    const group = merged({ ...nodesOf(ws).get('p|q|req:1')!, style: { width: '596px', height: '276px' }, width: 596, height: 276 }, nodesOf(ws).get('p|q|req:1')!)
    expect(group.style).toEqual({})
    expect(group.width).toBeUndefined()
    expect(group.height).toBeUndefined()
    // Into the group: what it had at the top (extent parent, expandParent) is gone
    expect(attach(ws.quests.q!.model, 'req:0', { kind: 'group', group: 'req:1' })).toBeNull()
    const after = merged(before, nodesOf(ws).get('p|q|req:0')!)
    expect(after).toMatchObject({ parentNode: 'p|q|req:1', expandParent: false })
    expect(after.extent).toBeUndefined()
    // Out again: back in the box, kept in it
    expect(leaveGroup(ws.quests.q!.model, 'req:0')).toBeNull()
    expect(merged(after, nodesOf(ws).get('p|q|req:0')!)).toMatchObject({ parentNode: 'q|q', extent: 'parent', expandParent: true })
  })

  it('a part never carries a canvas place of its own (its z, above its lifted box, stays with Vue Flow); its data says where it is', () => {
    const ws = workspace()
    const model = ws.quests.q!.model
    const at = partPositions(model, ws.quests.q!.positions)
    const nodes = nodesOf(ws)
    for (const key of ['req:0', 'req:1', 'req:1:0', 'req:1:2', 'req:1:2:1', 'start']) {
      const node = nodes.get(`p|q|${key}`)!
      expect('computedPosition' in node).toBe(false)
      expect((node.data as PartData).at).toEqual({ x: 100 + BOX_OFFSET.x + at[key]!.x, y: 50 + BOX_OFFSET.y + at[key]!.y })
    }
  })

  it('a part getting a new parent is placed where it goes, keeping its z; the others are left as Vue Flow has them', () => {
    const ws = workspace()
    const before = nodesOf(ws)
    // What Vue Flow has: req:0 in the box, let go over the group (z 1001 above the lifted box)
    const had = new Map([...before].map(([id, n]) => [id, { parentNode: n.parentNode, computedPosition: { x: 1, y: 2, z: 1001 } }]))
    attach(ws.quests.q!.model, 'req:0', { kind: 'group', group: 'req:1' })
    const next = [...nodesOf(ws).values()]
    placeReparented(next, (id) => had.get(id))
    const at = (next.find((n) => n.id === 'p|q|req:0')!.data as PartData).at!
    expect(had.get('p|q|req:0')!.computedPosition).toEqual({ x: at.x, y: at.y, z: 1001 })
    expect(had.get('p|q|start')!.computedPosition).toEqual({ x: 1, y: 2, z: 1001 })
    expect(had.get('p|q|req:1:0')!.computedPosition).toEqual({ x: 1, y: 2, z: 1001 })
  })
})
