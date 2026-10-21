import { describe, expect, it } from 'vitest'
import { interpret } from '../src/creator/canvas/flow'
import { boxSize, resizedBox, resizeLimits, type Point } from '../src/creator/layout'
import { addStage } from '../src/creator/ops'
import { emptyWorkspace, loadedQuest, putQuest } from '../src/creator/workspace'

function workspace() {
  const ws = emptyWorkspace('w')
  putQuest(ws, loadedQuest({ id: 'q', body: { id: 'q', name: 'Q', pool: 'p', objectives: { a: { type: 'fish', amount: 1 }, b: { type: 'fish', amount: 1, stage: 1 } } },
    layout: null, updatedAt: 1, updatedBy: null, source: 'server', webPending: false }))
  return ws
}
const part = (key: string) => `p|q|${key}`

describe('drawing the stage chain', () => {
  it('a stage drawn after another moves there', () => {
    const ws = workspace()
    expect(interpret(ws, { source: part('stage:1'), sourceHandle: 'next', target: part('stage:0'), targetHandle: 'prev' }))
      .toEqual({ ok: true, action: { kind: 'chain', quest: 'q', stage: 'stage:0', after: 'stage:1' } })
    expect(interpret(ws, { source: part('stage:0'), sourceHandle: 'next', target: part('finish'), targetHandle: 'prev' }))
      .toEqual({ ok: true, action: { kind: 'chain-end', quest: 'q', stage: 'stage:0' } })
  })

  it('a line drawn backwards (from the left dot) means the same', () => {
    const ws = workspace()
    expect(interpret(ws, { source: part('stage:0'), sourceHandle: 'prev', target: part('stage:1'), targetHandle: 'next' }))
      .toEqual({ ok: true, action: { kind: 'chain', quest: 'q', stage: 'stage:0', after: 'stage:1' } })
  })

  it('a loose stage drawn into the chain goes before the stage it points at', () => {
    const ws = workspace()
    const model = ws.quests.q!.model
    const loose = addStage(model)
    model.chain = model.chain.filter((n) => n !== loose)
    expect(interpret(ws, { source: part(loose), sourceHandle: 'next', target: part('stage:1'), targetHandle: 'prev' }))
      .toEqual({ ok: true, action: { kind: 'chain', quest: 'q', stage: loose, after: 'stage:0' } })
    expect(interpret(ws, { source: part('start'), sourceHandle: 'next', target: part('finish'), targetHandle: 'prev' }).ok).toBe(false)
  })
})

describe('resizing a quest box from any edge', () => {
  // start is 220 x 92, finish 180 x 56: the box fits them at 728 x 248, with 100 / 60 free on the left / top
  const parts = { start: { x: 100, y: 60 }, finish: { x: 500, y: 60 } }
  const box = { x: 1000, y: 500, open: true }
  /** Where each part is on the workspace. */
  const onScreen = (b: { x: number; y: number }, positions: Record<string, Point>) =>
    Object.fromEntries(Object.entries(positions).map(([k, p]) => [k, { x: b.x + p.x, y: b.y + p.y }]))

  it('each edge stops at the parts: the far side for right and bottom, the near side for left and top', () => {
    expect(boxSize(parts)).toEqual({ width: 728, height: 248 })
    expect(resizeLimits(parts, undefined, { width: 728, height: 248 })).toEqual({ right: 728, bottom: 248, left: 628, top: 188 })
    // Wider by hand: the left edge can take in that room too
    expect(resizeLimits(parts, undefined, { width: 900, height: 248 }).left).toBe(800)
  })

  it('a left or top edge moves the box and the parts stay where they are', () => {
    const grown = resizedBox(box, parts, undefined, { x: 950, y: 470, width: 778, height: 278 })
    expect(grown.box).toEqual({ x: 950, y: 470, open: true })
    expect(grown.positions).toEqual({ start: { x: 150, y: 90 }, finish: { x: 550, y: 90 } })
    expect(onScreen(grown.box, grown.positions)).toEqual(onScreen(box, parts))

    const shrunk = resizedBox(box, parts, undefined, { x: 1100, y: 560, width: 628, height: 188 })
    expect(shrunk.box).toEqual({ x: 1100, y: 560, open: true })
    expect(shrunk.positions).toEqual({ start: { x: 0, y: 0 }, finish: { x: 400, y: 0 } })
    expect(onScreen(shrunk.box, shrunk.positions)).toEqual(onScreen(box, parts))
  })

  it('an edge dragged past the parts stops at them, the far edges staying put', () => {
    const past = resizedBox(box, parts, undefined, { x: 1150, y: 600, width: 578, height: 148 })
    expect(past.box).toEqual({ x: 1100, y: 560, open: true })
    expect(past.positions.start).toEqual({ x: 0, y: 0 })
  })

  it('a right or bottom edge only sizes the box, and a top edge keeps a hand-set width', () => {
    const right = resizedBox(box, parts, undefined, { x: 1000, y: 500, width: 900, height: 248 })
    expect(right.box).toEqual({ x: 1000, y: 500, open: true, w: 900 })
    expect(right.positions).toBe(parts)

    const top = resizedBox({ ...box, w: 900, h: 400 }, parts, undefined, { x: 1000, y: 540, width: 900, height: 360 })
    expect(top.box).toEqual({ x: 1000, y: 540, open: true, w: 900, h: 360 })
    expect(top.positions.start).toEqual({ x: 100, y: 20 })
  })
})
