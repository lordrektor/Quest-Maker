<script setup lang="ts">
/**
 * The workspace canvas: pan, zoom, drag parts and quests, draw lines, drop types from the palette. Everything it
 * shows comes from the editor's workspace model; every gesture goes back into it.
 */
import '@vue-flow/core/dist/style.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import { MiniMap } from '@vue-flow/minimap'
import {
  VueFlow, useVueFlow, type Connection, type EdgeMouseEvent, type EdgeUpdateEvent, type GraphNode, type NodeDragEvent, type NodeMouseEvent,
  type OnConnectStartParams,
} from '@vue-flow/core'
import { computed, nextTick, watch } from 'vue'
import type { Category } from '../../../shared/creator'
import { useEditor } from '../editor'
import { BOX_OFFSET, memberOffsets, partSize, type Point, SIZE, sizeOf } from '../layout'
import { isGroupEntry, type Nid, type Parent, type QuestModel } from '../model'
import { groupLevel, parentOf } from '../ops'
import { deriveFlow, interpret, lineOf, parseId, partId, partKind, partPositions, placeReparented } from './flow'
import EntryNode from './EntryNode.vue'
import GhostNode from './GhostNode.vue'
import GroupNode from './GroupNode.vue'
import PartNode from './PartNode.vue'
import QuestBoxNode from './QuestBoxNode.vue'

const editor = useEditor()
const { screenToFlowCoordinate, fitView, findNode, setNodes, setEdges, setCenter, getViewport } = useVueFlow('workspace')

const flow = computed(() => {
  const derived = deriveFlow(editor.state.ws, editor.checked.value)
  const sel = editor.state.selection
  for (const node of derived.nodes) {
    const ref = parseId(node.id)
    const chosen = !!sel && !!ref && ((sel.kind === 'box' && ref.kind === 'box' && ref.quest === sel.quest)
      || (sel.kind === 'part' && ref.kind === 'part' && ref.quest === sel.quest && ref.key === sel.key)
      || (sel.kind === 'ghost' && ref.kind === 'ghost' && ref.quest === sel.quest))
    node.data = { ...node.data, chosen }
  }
  for (const edge of derived.edges) {
    const data = edge.data as { holder?: string; nid?: string; chain?: { quest: string; stage: string } | null } | undefined
    if ((sel?.kind === 'link' && data?.holder === sel.holder && data?.nid === sel.nid)
      || (sel?.kind === 'chain' && data?.chain?.quest === sel.quest && data.chain.stage === sel.stage)) {
      edge.style = { ...(edge.style as object), stroke: '#ffe6a8', strokeWidth: 4 }
    }
  }
  return derived
})

// Nodes first, then the edges: Vue Flow checks each edge against the nodes it has at that moment
watch(flow, (f) => {
  placeReparented(f.nodes, findNode)
  setNodes(f.nodes)
  setEdges(f.edges)
}, { immediate: true })

/** A new connection must mean something; the edges drawn from the model (Vue Flow checks those too) always do. */
function valid(c: Connection): boolean {
  const id = (c as { id?: unknown }).id
  if (typeof id === 'string' && /^[lec]\|/.test(id)) return true
  return interpret(editor.state.ws, c, editor.catalog.value?.response.catalog).ok
}

/** Where the line being drawn started; a line let go on a part's body (not its dot) still connects. */
let drawing: OnConnectStartParams | null = null
let connected = false

function onConnectStart(params: OnConnectStartParams) {
  drawing = params
  connected = false
}

function onConnect(c: Connection) {
  connected = true
  editor.connect(c)
}

/** The dot a line let go on a part's body is meant for. */
function dotFor(from: OnConnectStartParams, targetId: string): string | null {
  const target = parseId(targetId)
  const source = from.nodeId ? parseId(from.nodeId) : null
  if (!target || !source) return null
  if (from.handleId === 'starts' || from.handleId === 'unlocks' || from.handleId === 'fails' || from.handleId === 'fail-unlocks') {
    return target.kind === 'box' || target.kind === 'ghost' ? 'in' : null
  }
  if (target.kind !== 'part' || source.kind !== 'part' || target.quest !== source.quest) return null
  const model = editor.state.ws.quests[target.quest]?.model
  if (!model) return null
  const kind = partKind(model, target.key)
  if (from.handleId === 'next') return kind === 'stage' || kind === 'finish' ? 'prev' : null
  if (from.handleId === 'prev') return kind === 'stage' || kind === 'start' ? 'next' : null
  if (from.handleId === 'out') {
    const entry = model.entries[source.key]
    if (kind === 'stage') return entry?.category === 'reward' ? 'rew' : 'obj'
    if (kind === 'entry' && isGroupEntry(model.entries[target.key])) return entry?.category === 'requirement' ? 'req' : null
    if (kind === 'entry') return entry?.category === 'reward' && model.entries[target.key]?.category === 'objective' ? 'rew' : null
    if (kind === 'start') return 'req'
    if (kind === 'finish') return 'rew'
    if (kind === 'fail') return entry?.category === 'requirement' ? 'unless' : entry?.category === 'reward' ? 'then' : 'when'
    // A reward dropped on the Callbacks node runs on completion; pick another event by its dot
    if (kind === 'callbacks') return entry?.category === 'reward' ? 'cb-complete' : null
  }
  return null
}

/** A line whose end is being dragged, and which end. */
let moving: { edge: EdgeMouseEvent['edge']; end: 'source' | 'target'; source: string; target: string; sourceHandle: string | null;
  targetHandle: string | null } | null = null
let moved = false

function onEdgeUpdateStart({ edge, event }: EdgeMouseEvent) {
  const updater = (event.target as Element | null)?.closest('.vue-flow__edgeupdater')
  // Vue Flow may change the edge while it is dragged: keep where it went from and to
  moving = { edge, end: updater?.classList.contains('vue-flow__edgeupdater-source') ? 'source' : 'target', source: edge.source, target: edge.target,
    sourceHandle: edge.sourceHandle ?? null, targetHandle: edge.targetHandle ?? null }
  moved = false
}

function onEdgeUpdate({ edge, connection }: EdgeUpdateEvent) {
  moved = true
  const line = lineOf(edge)
  if (line) editor.reconnect(line, connection, moving?.target ?? edge.target)
}

/** Let go on a part's body (not its dot): connect there; on nothing: the line lets go. */
function onEdgeUpdateEnd({ edge, event }: EdgeMouseEvent) {
  const current = moving
  moving = null
  if (moved || !current) return
  const line = lineOf(edge)
  if (!line) return
  const point = 'clientX' in event ? event : (event as TouchEvent).changedTouches?.[0]
  const element = point ? document.elementFromPoint(point.clientX, point.clientY)?.closest('.vue-flow__node') : null
  const targetId = element?.getAttribute('data-id')
  if (!targetId) {
    editor.disconnect(line)
    return
  }
  // The end that stays is where the line is drawn from
  const fixed = current.end === 'target'
    ? { nodeId: current.source, handleId: current.sourceHandle, handleType: 'source' as const }
    : { nodeId: current.target, handleId: current.targetHandle, handleType: 'target' as const }
  if (targetId === fixed.nodeId) return
  const dot = dotFor(fixed, targetId)
  if (!dot) {
    editor.notify('That line cannot go there.', 'error')
    return
  }
  editor.reconnect(line, current.end === 'target'
    ? { source: current.source, sourceHandle: current.sourceHandle, target: targetId, targetHandle: dot }
    : { source: targetId, sourceHandle: dot, target: current.target, targetHandle: current.targetHandle }, current.target)
}

function onConnectEnd(event?: MouseEvent) {
  const from = drawing
  drawing = null
  if (connected || !from?.nodeId || !event) return
  const point = 'clientX' in event ? event : (event as unknown as TouchEvent).changedTouches?.[0]
  if (!point) return
  const element = document.elementFromPoint(point.clientX, point.clientY)?.closest('.vue-flow__node')
  const targetId = element?.getAttribute('data-id')
  if (!targetId || targetId === from.nodeId) return
  const dot = dotFor(from, targetId)
  if (!dot) return
  const c: Connection = from.handleType === 'target'
    ? { source: targetId, sourceHandle: dot, target: from.nodeId, targetHandle: from.handleId ?? null }
    : { source: from.nodeId, sourceHandle: from.handleId ?? null, target: targetId, targetHandle: dot }
  editor.connect(c)
}

function onDragStop(event: NodeDragEvent) {
  for (const node of event.nodes.length > 0 ? event.nodes : [event.node]) {
    const ref = parseId(node.id)
    if (!ref) continue
    if (ref.kind === 'box') editor.moveBox(ref.quest, node.position.x, node.position.y)
    else if (ref.kind === 'part' && !regroup(ref.quest, ref.key, node, pointer(event.event))) {
      editor.movePart(ref.quest, ref.key, node.position.x - BOX_OFFSET.x, node.position.y - BOX_OFFSET.y)
    }
  }
}

/**
 * {@return the innermost group of a quest under a point (inside its box), or null; never the part being moved or a
 * group inside it}
 */
function groupAt(quest: string, model: QuestModel, positions: Record<string, Point>, point: Point, moving: Nid): Nid | null {
  let found: Nid | null = null
  let level = 0
  for (const entry of Object.values(model.entries)) {
    const at = positions[entry.nid]
    if (!entry.members || !at || entry.nid === moving || inside(model, moving, entry.nid)) continue
    const size = partSize(model, entry.nid)
    const height = Math.max(size.h, findNode(partId(quest, entry.nid))?.dimensions.height ?? 0)
    if (point.x < at.x || point.x > at.x + size.w || point.y < at.y || point.y > at.y + height) continue
    const l = groupLevel(model, entry.nid)
    if (l > level) {
      found = entry.nid
      level = l
    }
  }
  return found
}

/** {@return true when a group holds an entry, at any level} */
function inside(model: QuestModel, group: Nid, nid: Nid): boolean {
  return (model.entries[group]?.members ?? []).some((m) => m === nid || inside(model, m, nid))
}

/** {@return where the pointer was let go, on the canvas} */
function pointer(event: MouseEvent | TouchEvent | undefined): Point | null {
  const at = event && ('clientX' in event ? event : event.changedTouches?.[0])
  return at ? screenToFlowCoordinate({ x: at.clientX, y: at.clientY }) : null
}

/**
 * A requirement or group let go on a group joins it (at the place it was let go; the innermost group under the
 * pointer, refused when groups would go too deep), one dragged out of its group leaves it (into the list the group sits
 * in), one moved inside its group takes another place in it.
 * {@return true when it was one of these}
 */
function regroup(quest: string, key: string, node: GraphNode, dropped: Point | null): boolean {
  const state = editor.state.ws.quests[quest]
  const model = state?.model
  const entry = model?.entries[key]
  if (!state || !model || !entry || entry.category !== 'requirement') return false
  const positions = partPositions(model, state.positions)
  const parent = parentOf(model, key)
  const holder = parent?.kind === 'group' ? positions[parent.group] : undefined
  // Where it was let go, inside the quest box (a group's requirement is placed inside its group)
  const at = holder ? { x: holder.x + node.position.x, y: holder.y + node.position.y } : { x: node.position.x - BOX_OFFSET.x, y: node.position.y - BOX_OFFSET.y }
  const size = { w: node.dimensions.width || SIZE.entry.w, h: node.dimensions.height || SIZE.entry.h }
  // Where the pointer let go (inside the quest box), or the middle of the part
  const box = editor.state.ws.boxes[quest]
  const point = dropped && box ? { x: dropped.x - box.x - BOX_OFFSET.x, y: dropped.y - box.y - BOX_OFFSET.y } : { x: at.x + size.w / 2, y: at.y + size.h / 2 }
  const target = groupAt(quest, model, positions, point, key)
  if (target) {
    // Its place: before the first member whose middle is below where it was let go (a group too deep is refused)
    const offsets = memberOffsets(model, target)
    const others = model.entries[target]!.members!.map((m, j) => ({ m, middle: positions[target]!.y + offsets[j]!.y + partSize(model, m).h / 2 }))
      .filter((o) => o.m !== key)
    const index = others.filter((o) => o.middle < point.y).length
    editor.groupInto(quest, key, target, index)
    return true
  }
  if (parent?.kind === 'group') {
    editor.ungroup(quest, key, at)
    return true
  }
  return false
}

function onNodeClick({ node }: NodeMouseEvent) {
  const ref = parseId(node.id)
  if (!ref) return
  editor.state.selection = ref.kind === 'part' ? { kind: 'part', quest: ref.quest, key: ref.key }
    : ref.kind === 'box' ? { kind: 'box', quest: ref.quest } : { kind: 'ghost', quest: ref.quest }
}

function onEdgeClick({ edge }: EdgeMouseEvent) {
  const data = edge.data as { holder?: string; nid?: string; chain?: { quest: string; stage: string } | null } | undefined
  if (data?.holder && data.nid) {
    editor.state.selection = { kind: 'link', holder: data.holder, nid: data.nid }
    return
  }
  if (data?.chain) {
    editor.state.selection = { kind: 'chain', quest: data.chain.quest, stage: data.chain.stage }
    return
  }
  // An entry's line: select the entry
  const [kind, quest, nid] = edge.id.split('|')
  if (kind === 'e' && quest && nid) editor.state.selection = { kind: 'part', quest, key: nid }
}

/** The palette's types: dropped inside a quest box, they join that quest there. */
function onDrop(event: DragEvent) {
  const raw = event.dataTransfer?.getData('application/x-chronos-part')
  if (!raw) return
  event.preventDefault()
  const part = JSON.parse(raw) as { category?: Category; type?: string }
  const at = screenToFlowCoordinate({ x: event.clientX, y: event.clientY })
  const quest = editor.state.ws.order.find((id) => {
    const box = editor.state.ws.boxes[id]!
    const node = findNode(`q|${id}`)
    const width = node?.dimensions.width ?? 0
    const height = node?.dimensions.height ?? 0
    return box.open && at.x >= box.x && at.x <= box.x + width && at.y >= box.y && at.y <= box.y + height
  }) ?? (editor.state.ws.order.length === 1 ? editor.state.ws.order[0] : undefined)
  if (!quest) {
    editor.notify('Drop it inside an open quest box.', 'error')
    return
  }
  const box = editor.state.ws.boxes[quest]!
  const inside = { x: Math.max(0, Math.round(at.x - box.x - BOX_OFFSET.x)), y: Math.max(0, Math.round(at.y - box.y - BOX_OFFSET.y)) }
  if (part.category && part.type) editor.addPart(quest, part.category, part.type, inside, dropPlace(quest, part.category, event))
}

/**
 * {@return where a requirement dropped on a part goes: on the fail rules → fail.unless, on a group → into it, anywhere
 * else → the requirements (a type that place cannot take is refused with the reason); undefined for other categories}
 */
function dropPlace(quest: string, category: Category, event: DragEvent): Parent | undefined {
  if (category !== 'requirement') return undefined
  const id = document.elementFromPoint(event.clientX, event.clientY)?.closest('.vue-flow__node')?.getAttribute('data-id')
  const ref = id ? parseId(id) : null
  const model = editor.state.ws.quests[quest]?.model
  if (!model || ref?.kind !== 'part' || ref.quest !== quest) return { kind: 'requirements' }
  if (ref.key === 'fail') return { kind: 'unless' }
  if (isGroupEntry(model.entries[ref.key])) return { kind: 'group', group: ref.key }
  const parent = parentOf(model, ref.key)
  return parent?.kind === 'unless' || parent?.kind === 'group' ? parent : { kind: 'requirements' }
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-chronos-part')) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
}

// A stage or fail rules just added: move the canvas to it, then make it pulse twice
watch(() => editor.state.focus, async (focus) => {
  if (!focus) return
  const id = `p|${focus.quest}|${focus.key}`
  // Wait for the new part to be drawn (its size is measured a little later; the layout's size stands in until then)
  for (let tries = 0; tries < 40; tries++) {
    await nextTick()
    const node = findNode(id)
    if (node && (node.dimensions.width > 0 || tries >= 10)) {
      const size = node.dimensions.width > 0 ? { w: node.dimensions.width, h: node.dimensions.height } : sizeOf(focus.key)
      const zoom = Math.max(getViewport().zoom, 0.85)
      // The move's promise is not always kept (an interrupted transition): pulse once it has had time to arrive
      void setCenter(node.computedPosition.x + size.w / 2, node.computedPosition.y + size.h / 2, { zoom, duration: 450 })
      setTimeout(() => pulse(id), 470)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
})

/** Two pulses of light around a node (one steady glow when the visitor prefers less motion). */
function pulse(id: string) {
  const el = document.querySelector<HTMLElement>(`.chronos-flow .vue-flow__node[data-id="${CSS.escape(id)}"] > *`)
  if (!el) return
  const off = '0 0 0 0 rgb(255 211 110 / 0)'
  const on = '0 0 0 6px rgb(255 211 110 / 0.65), 0 0 28px 8px rgb(245 184 61 / 0.45)'
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.animate(still ? [{ boxShadow: on }, { boxShadow: on }] : [{ boxShadow: off }, { boxShadow: on }, { boxShadow: off }],
    { duration: still ? 1600 : 800, iterations: still ? 1 : 2, easing: 'ease-in-out' })
}

watch(() => editor.state.version, async () => {
  await nextTick()
  setTimeout(() => fitView({ padding: 0.15, duration: 250 }), 50)
})
</script>

<template>
  <div class="relative h-full w-full" @drop="onDrop" @dragover="onDragOver">
    <VueFlow
      id="workspace"
      class="chronos-flow"
      :min-zoom="0.15"
      :max-zoom="2"
      :delete-key-code="null"
      :is-valid-connection="valid"
      :elevate-edges-on-select="true"
      :connection-radius="44"
      :snap-to-grid="true"
      :snap-grid="[8, 8]"
      fit-view-on-init
      @connect-start="onConnectStart"
      @connect="onConnect"
      @connect-end="onConnectEnd"
      @edge-update-start="onEdgeUpdateStart"
      @edge-update="onEdgeUpdate"
      @edge-update-end="onEdgeUpdateEnd"
      :edge-updater-radius="16"
      @node-drag-stop="onDragStop"
      @node-click="onNodeClick"
      @edge-click="onEdgeClick"
      @pane-click="editor.state.selection = null"
    >
      <template #node-quest="p"><QuestBoxNode v-bind="p" /></template>
      <template #node-start="p"><PartNode v-bind="p" /></template>
      <template #node-stage="p"><PartNode v-bind="p" /></template>
      <template #node-finish="p"><PartNode v-bind="p" /></template>
      <template #node-fail="p"><PartNode v-bind="p" /></template>
      <template #node-callbacks="p"><PartNode v-bind="p" /></template>
      <template #node-entry="p"><EntryNode v-bind="p" /></template>
      <template #node-requirement-group="p"><GroupNode v-bind="p" /></template>
      <template #node-ghost="p"><GhostNode v-bind="p" /></template>
      <Background pattern-color="#2a313c" :gap="24" />
      <MiniMap pannable zoomable mask-color="rgb(11 13 17 / 0.75)" node-color="#2a313c" class="hidden! md:block!" />
      <Controls :show-interactive="false" />
    </VueFlow>
    <div v-if="editor.state.ws.order.length === 0" class="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
      <div class="card max-w-md px-6 py-8 text-center">
        <p class="eyebrow mb-2">Empty workspace</p>
        <p class="text-night-300">Type a quest id above and press <span class="text-night-100">Add quest</span>: an id that exists opens that quest,
          a new one starts a quest. Quests are never listed.</p>
      </div>
    </div>
  </div>
</template>

<style>
.chronos-flow {
  --vf-node-bg: transparent;
  --vf-node-text: var(--color-night-100);
  --vf-connection-path: var(--color-gold-400);
  --vf-handle: var(--color-night-400);
  background: var(--color-night-950);
}

.chronos-flow .vue-flow__node {
  border: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
}

.chronos-flow .vue-flow__node.selected,
.chronos-flow .vue-flow__node:focus-visible {
  outline: none;
}

.chronos-flow .chronos-handle {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-night-950);
  background: var(--color-night-400);
}

.chronos-flow .chronos-handle.connectable:hover,
.chronos-flow .vue-flow__handle.connecting,
.chronos-flow .vue-flow__handle.valid {
  background: var(--color-gold-300);
}

.chronos-flow .chronos-handle-starts {
  width: 18px;
  height: 18px;
  background: var(--color-gold-400);
}

.chronos-flow .chronos-handle-unlocks {
  width: 18px;
  height: 18px;
  background: var(--color-emerald-400);
}

.chronos-flow .chronos-handle-fails {
  width: 18px;
  height: 18px;
  background: #f87171;
}

.chronos-flow .chronos-handle-fail-unlocks {
  width: 18px;
  height: 18px;
  background: #fca5a5;
}

.chronos-flow .chronos-handle-cb {
  background: #a78bfa;
}

.chronos-flow .chronos-handle-rew {
  background: var(--color-gold-500);
}

.chronos-flow .chronos-handle-in {
  width: 18px;
  height: 18px;
  background: var(--color-night-300);
}

.chronos-flow .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: var(--color-gold-200) !important;
}

.chronos-flow .vue-flow__controls {
  box-shadow: none;
  border: 1px solid var(--color-night-700);
  border-radius: 0.5rem;
  overflow: hidden;
}

.chronos-flow .vue-flow__controls-button {
  background: var(--color-night-850);
  border-bottom: 1px solid var(--color-night-700);
  fill: var(--color-night-200);
}

.chronos-flow .vue-flow__controls-button:hover {
  background: var(--color-night-700);
}

.chronos-flow .chronos-resize-line {
  border-color: transparent;
}

.chronos-flow .chronos-resize-line:hover {
  border-color: var(--color-gold-400);
}

.chronos-flow .chronos-resize-corner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--color-night-950);
  border-radius: 3px;
  background: var(--color-night-400);
}

.chronos-flow .chronos-resize-corner:hover {
  background: var(--color-gold-300);
}

.chronos-flow .vue-flow__minimap {
  background: var(--color-night-900);
  border: 1px solid var(--color-night-700);
  border-radius: 0.5rem;
}
</style>
