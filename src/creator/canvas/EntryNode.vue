<script setup lang="ts">
/** An objective, requirement or reward on the canvas: its icon, type and what it asks or gives. */
import PixelIcon from '../../components/PixelIcon.vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { computed } from 'vue'
import TypeIcon from '../../components/TypeIcon.vue'
import MiniText from '../../components/MiniText.vue'
import { describeAction, describeObjective, describeRequirement } from '../../describe'
import { useEditor } from '../editor'
import { entryTree } from '../model'
import type { PartData } from './flow'

const props = defineProps<NodeProps<PartData>>()
const editor = useEditor()

const entry = computed(() => editor.state.ws.quests[props.data.quest]?.model.entries[props.data.key])
const spec = computed(() => (entry.value ? editor.catalog.value?.type(entry.value.category, entry.value.type) : undefined))
const where = computed(() => editor.parentOf(props.data.quest, props.data.key))
const label = computed(() => {
  if (!entry.value) return ''
  if (entry.value.category === 'objective') return where.value?.kind === 'when' ? 'Fail when' : 'Objective'
  if (entry.value.category === 'requirement') {
    // In a group: the list the group sits in
    const place = where.value?.kind === 'group' ? editor.parentOf(props.data.quest, where.value.group) : where.value
    return `${place?.kind === 'unless' ? 'Fail unless' : 'Requirement'}${where.value?.kind === 'group' ? ' · in group' : ''}`
  }
  if (where.value?.kind === 'actions') return 'If it fails'
  if (where.value?.kind === 'objective-rewards') return 'Objective reward'
  if (where.value?.kind === 'stage-rewards') return 'Stage reward'
  if (where.value?.kind === 'callback') return `Callback · on ${where.value.event}`
  if (where.value?.kind === 'objective-callbacks') return 'Objective callback'
  if (where.value?.kind === 'stage-callbacks') return 'Stage callback'
  return 'Reward'
})
/** The part of the quest it belongs to, as an icon. */
const badge = computed(() => {
  const kind = where.value?.kind
  if (kind === 'when' || kind === 'unless' || kind === 'actions') return 'fail'
  if (where.value?.kind === 'group' && editor.parentOf(props.data.quest, where.value.group)?.kind === 'unless') return 'fail'
  if (kind === 'callback' || kind === 'objective-callbacks' || kind === 'stage-callbacks') return 'bolt'
  return entry.value?.category ?? 'objective'
})
/** An objective in a stage (or loose) takes rewards of its own; a fail condition does not. */
const takesRewards = computed(() => entry.value?.category === 'objective' && where.value?.kind !== 'when')
const line = computed(() => {
  const e = entry.value
  if (!e) return { mini: '' }
  // A reward's line says its requirements too ("…, only if: …")
  const tree = entryTree(e, editor.state.ws.quests[props.data.quest]?.model)
  if (e.category === 'objective') return describeObjective(e.objectiveId ?? 'objective', tree)
  if (e.category === 'requirement') return describeRequirement(tree)
  return describeAction(tree)
})
/** Its tooltip: what the type does, and for an optional reward when it is given. */
const tooltip = computed(() => {
  const what = spec.value?.description ?? entry.value?.type ?? ''
  return entry.value?.category === 'reward' && (entry.value.requires?.length ?? 0) > 0
    ? `${what}
Given only when its requirements hold; otherwise it is skipped, the other rewards are still given and the quest still completes.`
    : what
})
const tone = computed(() => {
  if (props.data.level === 'error') return 'border-red-400/70'
  if (props.data.level === 'warning') return 'border-gold-400/60'
  return entry.value?.category === 'reward' ? 'border-gold-900' : entry.value?.category === 'requirement' ? 'border-sky-900' : 'border-night-600'
})
</script>

<template>
  <div
    v-if="entry"
    class="flex min-h-16 w-[220px] items-center gap-2 rounded-lg border bg-night-900 px-2 py-1.5 shadow-sm"
    :class="[tone, data.loose ? 'opacity-60 border-dashed' : '', (selected || data.chosen) ? 'ring-2 ring-gold-400' : '']"
    :title="tooltip"
  >
    <TypeIcon :category="entry.category" :type="entry.type" size="sm" :label="spec?.description ?? entry.type" />
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-1 text-[10px] tracking-wide text-night-400 uppercase">
        <PixelIcon :name="badge" :size="10" /><span>{{ label }}</span>
        <span v-if="entry.category === 'requirement' && entry.not" class="rounded bg-red-500/20 px-1 text-red-200"
              title="Must not: the player must NOT meet it">not</span>
        <span v-if="data.level" :class="data.level === 'error' ? 'text-red-300' : 'text-gold-300'" aria-hidden="true">●</span>
      </div>
      <!-- Never cut: a long sentence wraps and the box grows -->
      <div class="text-[11px] leading-[13px] break-words text-night-100">
        <MiniText :text="line.mini" :placeholders="line.placeholders" />
      </div>
      <div class="font-mono text-[10px] break-all text-night-400">{{ entry.objectiveId ?? entry.type }}</div>
    </div>
    <!-- In a group it has no line of its own (the group has): no dot; it leaves the group by being dragged out -->
    <Handle v-if="where?.kind !== 'group'" id="out" type="source" :position="sourcePosition ?? Position.Top" class="chronos-handle" />
    <Handle v-if="takesRewards" id="cb" type="target" :position="Position.Bottom" class="chronos-handle chronos-handle-cb" style="left: 80%"
            title="Callbacks run once this objective is done" />
    <Handle v-if="takesRewards" id="rew" type="target" :position="Position.Bottom" class="chronos-handle chronos-handle-rew"
            title="Rewards given once this objective is done" />
  </div>
</template>
