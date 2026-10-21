<script setup lang="ts">
/**
 * A group of requirements on the canvas (all: "and", any: "or"), each with its own Must / Must not. Its title says
 * whether it is flipped (Not all of, None of).
 * Its requirements are drawn inside it, in order; drag one out to take it out, drop one on it to put it in.
 */
import PixelIcon from '../../components/PixelIcon.vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { computed } from 'vue'
import MiniText from '../../components/MiniText.vue'
import { groupLabel } from '../../describe'
import { useEditor } from '../editor'
import { GROUP, partSize } from '../layout'
import { groupMode } from '../model'
import type { PartData } from './flow'

const props = defineProps<NodeProps<PartData>>()
const editor = useEditor()

const entry = computed(() => editor.state.ws.quests[props.data.quest]?.model.entries[props.data.key])
const where = computed(() => editor.parentOf(props.data.quest, props.data.key))
const members = computed(() => entry.value?.members?.length ?? 0)
/** Its size from its members (a group inside it as big as its own). */
const size = computed(() => {
  const model = editor.state.ws.quests[props.data.quest]?.model
  return model ? partSize(model, props.data.key) : { w: GROUP.w, h: 0 }
})
const mode = computed(() => (entry.value ? groupMode(entry.value) : 'all'))
/** All of, Not all of, Any of or None of. */
const join = computed(() => groupLabel(mode.value, entry.value?.not === true))
const meaning = computed(() => ({
  'All of': 'Met when all of its requirements are',
  'Not all of': 'Met when NOT all of its requirements are',
  'Any of': 'Met when at least one of its requirements is',
  'None of': 'Met when none of its requirements is',
}[join.value]))
const label = computed(() => (where.value?.kind === 'unless' ? 'Fail unless · group' : where.value?.kind === 'requirements' ? 'Requirement group'
  : where.value?.kind === 'group' ? 'Group · in group' : 'Group'))
const tone = computed(() => {
  if (props.data.level === 'error') return 'border-red-400/70'
  if (props.data.level === 'warning') return 'border-gold-400/60'
  return 'border-sky-800'
})
</script>

<template>
  <div
    v-if="entry"
    class="flex flex-col rounded-lg border-2 bg-night-950/70 shadow-sm"
    :class="[tone, data.loose ? 'opacity-70 border-dashed' : '', (selected || data.chosen) ? 'ring-2 ring-gold-400' : '']"
    :style="{ width: `${size.w}px` }"
    :title="meaning"
  >
    <div class="flex flex-col justify-center px-2" :style="{ height: `${GROUP.header}px` }">
      <div class="flex flex-wrap items-center gap-1 text-[10px] tracking-wide text-night-400 uppercase">
        <PixelIcon :name="where?.kind === 'unless' ? 'fail' : 'requirement'" :size="10" /><span>{{ label }}</span>
        <span v-if="data.level" :class="data.level === 'error' ? 'text-red-300' : 'text-gold-300'" aria-hidden="true">●</span>
      </div>
      <div class="flex items-center gap-1 text-[12px] font-semibold text-sky-200">
        <span>{{ join }}</span>
      </div>
    </div>
    <!-- Room for its requirements (their nodes are drawn here) -->
    <div class="relative" :style="{ height: `${size.h - GROUP.header - GROUP.pad}px` }">
      <p v-if="members === 0" class="mx-2 grid h-full place-items-center rounded-md border border-dashed border-night-700 px-2 text-center text-[11px] text-night-400">
        Drop requirements here, or wire them to its left dot</p>
    </div>
    <!-- Never cut: the display wraps under the requirements and the box grows -->
    <div v-if="entry.display" class="px-2 pt-1 text-[11px] leading-[13px] break-words text-night-200">
      <span class="text-[10px] text-night-400 uppercase">Shown as </span><MiniText :text="entry.display" />
    </div>
    <div :style="{ height: `${GROUP.pad}px` }" />
    <Handle id="req" type="target" :position="Position.Left" class="chronos-handle" title="Requirements in this group" />
    <!-- Inside a group it has no line of its own: no dot -->
    <Handle v-if="where?.kind !== 'group'" id="out" type="source" :position="sourcePosition ?? Position.Right" class="chronos-handle" />
  </div>
</template>
