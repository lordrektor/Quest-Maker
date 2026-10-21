<script setup lang="ts">
/**
 * A quest on the workspace: a box holding its parts (open), or a card (closed). Its right edge draws the lines to
 * other quests (starts, unlocks); its left edge takes them.
 */
import PixelIcon from '../../components/PixelIcon.vue'
import { Handle, Position, useVueFlow, type NodeProps } from '@vue-flow/core'
import { NodeResizeControl, ResizeControlVariant, type ControlPosition, type OnResize, type OnResizeEnd, type OnResizeStart } from '@vue-flow/node-resizer'
import '@vue-flow/node-resizer/dist/style.css'
import { computed } from 'vue'
import Chip from '../../components/Chip.vue'
import ItemIcon from '../../components/ItemIcon.vue'
import MiniText from '../../components/MiniText.vue'
import { difficultyLabel } from '../../describe'
import { useEditor } from '../editor'
import type { BoxLimits } from '../layout'
import { linkedIds } from '../workspace'
import type { BoxData } from './flow'

const props = defineProps<NodeProps<BoxData>>()
const editor = useEditor()

const state = computed(() => editor.state.ws.quests[props.data.quest])
const model = computed(() => state.value?.model)
const isNew = computed(() => state.value?.base === null)
const dirty = computed(() => editor.isDirty(props.data.quest))
const objectives = computed(() => model.value?.chain.reduce((n, s) => n + (model.value?.stages[s]?.objectives.length ?? 0), 0) ?? 0)
const linkable = computed(() => linkedIds(editor.state.ws, props.data.quest).length)

/** Every edge and corner resizes the box; each stops at the parts (its smallest width and height by those edges). */
const HANDLES: { position: ControlPosition; width: keyof BoxLimits; height: keyof BoxLimits }[] = [
  { position: 'left', width: 'left', height: 'bottom' },
  { position: 'right', width: 'right', height: 'bottom' },
  { position: 'top', width: 'right', height: 'top' },
  { position: 'bottom', width: 'right', height: 'bottom' },
  { position: 'top-left', width: 'left', height: 'top' },
  { position: 'top-right', width: 'right', height: 'top' },
  { position: 'bottom-left', width: 'left', height: 'bottom' },
  { position: 'bottom-right', width: 'right', height: 'bottom' },
]
const LINES: ControlPosition[] = ['left', 'right', 'top', 'bottom']

const { getNodes, updateNode } = useVueFlow()
/** While a left or top edge is dragged: where the box and its parts were, so the parts stay still as the box moves. */
let dragged: { x: number; y: number; parts: Map<string, { x: number; y: number }> } | null = null

function resizeStart({ params }: OnResizeStart) {
  const parts = new Map<string, { x: number; y: number }>()
  for (const node of getNodes.value) if (node.parentNode === props.id) parts.set(node.id, { ...node.position })
  dragged = { x: params.x, y: params.y, parts }
}

function resizing({ params }: OnResize) {
  if (!dragged) return
  const dx = params.x - dragged.x
  const dy = params.y - dragged.y
  for (const [id, at] of dragged.parts) updateNode(id, { position: { x: at.x - dx, y: at.y - dy } })
}

function resized({ params }: OnResizeEnd) {
  dragged = null
  editor.resizeBox(props.data.quest, params)
}
</script>

<template>
  <div
    v-if="model"
    class="relative h-full w-full rounded-xl border-2 bg-night-950/60"
    :class="[data.level === 'error' ? 'border-red-400/60' : (selected || data.chosen) ? 'border-gold-400' : 'border-night-700', data.open ? '' : 'bg-night-900']"
  >
    <div class="box-handle flex min-h-12 cursor-grab items-center gap-2 rounded-t-xl border-b border-night-700 bg-night-850/90 px-3 active:cursor-grabbing">
      <ItemIcon :item="model.settings.icon" size="sm" class="size-8!" />
      <div class="min-w-0 flex-1">
        <div class="text-[13px] leading-tight font-semibold break-words"><MiniText :text="model.settings.name" /></div>
        <div class="font-mono text-[11px] break-all text-night-400">{{ model.id }}</div>
      </div>
      <button type="button" class="nodrag shrink-0 rounded-md border border-night-600 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-night-200 hover:border-gold-400"
              :title="`Add a stage at the end of ${model.id}`" @click.stop="editor.addStageTo(data.quest)"><PixelIcon name="stage" :size="10" class="mr-1 align-[-1px]" />Stage +</button>
      <button type="button" class="nodrag shrink-0 rounded-md border border-night-600 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-night-200 hover:border-red-400"
              :title="model.fail.shown ? `Go to the fail rules of ${model.id}` : `Add fail rules to ${model.id}`"
              @click.stop="editor.addFail(data.quest)"><PixelIcon name="fail" :size="10" class="mr-1 align-[-1px]" />Fail rules {{ model.fail.shown ? '→' : '+' }}</button>
      <button type="button" class="nodrag shrink-0 rounded-md border border-night-600 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-night-200 hover:border-violet-400"
              :title="model.callbacksShown ? `Go to the callbacks of ${model.id}` : `Add callbacks to ${model.id}`"
              @click.stop="editor.addCallbacks(data.quest)"><PixelIcon name="bolt" :size="10" class="mr-1 align-[-1px]" />Callbacks {{ model.callbacksShown ? '→' : '+' }}</button>
      <Chip v-if="isNew" tone="other">new</Chip>
      <Chip v-else-if="dirty" tone="medium">unsaved</Chip>
      <span v-if="data.level === 'error'" class="text-xs text-red-300" title="This quest has errors">errors</span>
      <button
        type="button"
        class="nodrag rounded-md px-1.5 py-0.5 text-xs text-night-300 hover:bg-night-700 hover:text-night-100"
        :aria-label="data.open ? `Close ${model.id}` : `Open ${model.id}`"
        :title="data.open ? 'Close to a card' : 'Open its parts'"
        @click.stop="editor.toggleBox(data.quest)"
      >{{ data.open ? '▾' : '▸' }}</button>
    </div>

    <div v-if="!data.open" class="flex flex-wrap items-center gap-1 px-3 py-2 text-xs text-night-300">
      <Chip v-if="model.settings.pool">{{ model.settings.pool }}</Chip>
      <Chip v-if="model.settings.difficulty" tone="accent">{{ difficultyLabel(model.settings.difficulty) }}</Chip>
      <span>{{ model.chain.length }} stage{{ model.chain.length === 1 ? '' : 's' }} · {{ objectives }} objective{{ objectives === 1 ? '' : 's' }}</span>
      <button
        v-if="linkable > 0"
        type="button"
        class="nodrag ml-auto rounded-md border border-night-600 px-1.5 py-0.5 text-[11px] hover:border-gold-400"
        @click.stop="editor.loadLinked(data.quest)"
      >Load {{ linkable }} linked</button>
    </div>

    <template v-if="data.open">
      <NodeResizeControl v-for="h in HANDLES" :key="h.position" :node-id="id" :position="h.position"
                         :variant="LINES.includes(h.position) ? ResizeControlVariant.Line : ResizeControlVariant.Handle"
                         :min-width="data.limits[h.width]" :min-height="data.limits[h.height]"
                         :class="LINES.includes(h.position) ? 'chronos-resize-line' : 'chronos-resize-corner'"
                         @resize-start="resizeStart" @resize="resizing" @resize-end="resized" />
    </template>

    <Handle id="in" type="target" :position="Position.Left" class="chronos-handle chronos-handle-in" title="Started or unlocked by another quest" />
    <Handle id="starts" type="source" :position="Position.Right" class="chronos-handle chronos-handle-starts" style="top: 18px"
            title="Drag to a quest it starts (start_quest reward)" />
    <Handle id="unlocks" type="source" :position="Position.Right" class="chronos-handle chronos-handle-unlocks" style="top: 42px"
            title="Drag to a quest it unlocks (quest_completed requirement)" />
    <Handle id="fails" type="source" :position="Position.Right" class="chronos-handle chronos-handle-fails" style="top: 66px"
            title="Drag to a quest it starts when it fails (start_quest in its fail actions)" />
    <Handle id="fail-unlocks" type="source" :position="Position.Right" class="chronos-handle chronos-handle-fail-unlocks" style="top: 90px"
            title="Drag to a quest it unlocks when it fails (quest_failed requirement)" />
    <span class="pointer-events-none absolute top-[11px] -right-[58px] text-[10px] font-semibold text-gold-400">starts</span>
    <span class="pointer-events-none absolute top-[35px] -right-[62px] text-[10px] font-semibold text-emerald-400">unlocks</span>
    <span class="pointer-events-none absolute top-[59px] -right-[86px] text-[10px] font-semibold text-red-400">fail: starts</span>
    <span class="pointer-events-none absolute top-[83px] -right-[90px] text-[10px] font-semibold text-red-300">fail: unlocks</span>
  </div>
</template>
