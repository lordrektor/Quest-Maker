<script setup lang="ts">
/** The fixed parts of a quest: Start (its settings, the requirements), a Stage, Finish (the rewards), the Fail rules. */
import { CALLBACK_EVENTS } from '../../../shared/quest/canonical'
import PixelIcon from '../../components/PixelIcon.vue'
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { computed } from 'vue'
import Chip from '../../components/Chip.vue'
import MiniText from '../../components/MiniText.vue'
import { difficultyLabel, humanDuration } from '../../describe'
import { formatDuration } from '../../../shared/quest/durations'
import { useEditor } from '../editor'
import { stageNumbers } from '../model'
import type { PartData } from './flow'

const props = defineProps<NodeProps<PartData>>()
const editor = useEditor()

const model = computed(() => editor.state.ws.quests[props.data.quest]?.model)
const kind = computed(() => props.type as 'start' | 'stage' | 'finish' | 'fail' | 'callbacks')
const stage = computed(() => (kind.value === 'stage' ? model.value?.stages[props.data.key] : undefined))
const stageLabel = computed(() => {
  if (!model.value || !stage.value) return ''
  const n = stageNumbers(model.value).numbers.get(stage.value.nid)
  if (!model.value.chain.includes(stage.value.nid)) return 'Stage (off the chain)'
  return n === undefined ? 'Stage (empty)' : `Stage ${n}`
})
const border = computed(() => {
  if (props.data.level === 'error') return 'border-red-400/70'
  if (props.data.level === 'warning') return 'border-gold-400/60'
  return { start: 'border-emerald-500/60', stage: 'border-night-400/60', finish: 'border-gold-500/60', fail: 'border-red-900', callbacks: 'border-violet-400/60' }[kind.value]
})
</script>

<template>
  <div
    v-if="model"
    class="rounded-lg border-2 bg-night-850 px-3 py-2 shadow"
    :class="[border, (selected || data.chosen) ? 'ring-2 ring-gold-400' : '', data.loose ? 'border-dashed opacity-70' : '',
             { start: 'min-h-[92px] w-[220px]', stage: 'h-14 w-[180px]', finish: 'h-14 w-[180px]', fail: 'h-[76px] w-[200px]', callbacks: 'h-[150px] w-[200px]' }[kind]]"
  >
    <template v-if="kind === 'start'">
      <div class="eyebrow flex items-center gap-1 text-emerald-300!"><PixelIcon name="start" :size="11" />Start</div>
      <div class="text-[13px] leading-tight font-semibold break-words"><MiniText :text="model.settings.name" /></div>
      <div class="mt-1 flex flex-wrap gap-1">
        <Chip v-if="model.settings.pool">{{ model.settings.pool }}</Chip>
        <Chip v-else tone="hard">no pool</Chip>
        <Chip v-if="model.settings.difficulty" tone="accent">{{ difficultyLabel(model.settings.difficulty) }}</Chip>
        <Chip v-if="model.settings.repeatable" tone="other">repeatable</Chip>
      </div>
      <Handle id="req" type="target" :position="Position.Left" class="chronos-handle" title="Requirements" />
      <Handle id="next" type="source" :position="Position.Right" class="chronos-handle" />
    </template>

    <template v-else-if="kind === 'stage'">
      <div class="eyebrow flex items-center gap-1 text-night-300!"><PixelIcon name="stage" :size="11" />{{ stageLabel }}</div>
      <div class="text-xs text-night-300">
        {{ stage?.objectives.length ?? 0 }} objective{{ stage?.objectives.length === 1 ? '' : 's' }}, together<template v-if="stage?.rewards.length">
          · {{ stage.rewards.length }} reward{{ stage.rewards.length === 1 ? '' : 's' }}</template>
      </div>
      <Handle id="rew" type="target" :position="Position.Top" class="chronos-handle chronos-handle-rew" title="Rewards given when this stage is done" />
      <Handle id="cb" type="target" :position="Position.Top" class="chronos-handle chronos-handle-cb" style="left: 80%" title="Callbacks run when this stage is done" />
      <Handle id="prev" type="target" :position="Position.Left" class="chronos-handle" />
      <Handle id="next" type="source" :position="Position.Right" class="chronos-handle" />
      <Handle id="obj" type="target" :position="Position.Bottom" class="chronos-handle" title="Objectives" />
    </template>

    <template v-else-if="kind === 'finish'">
      <div class="eyebrow flex items-center gap-1"><PixelIcon name="finish" :size="11" />Finish</div>
      <div class="text-xs text-night-300">{{ model.rewards.length }} reward{{ model.rewards.length === 1 ? '' : 's' }}</div>
      <Handle id="prev" type="target" :position="Position.Left" class="chronos-handle" />
      <Handle id="rew" type="target" :position="Position.Right" class="chronos-handle" title="Rewards" />
    </template>

    <template v-else-if="kind === 'callbacks'">
      <div class="eyebrow flex items-center gap-1 text-violet-300!"><PixelIcon name="bolt" :size="11" />Callbacks</div>
      <div class="text-[10px] text-night-400">Actions on the run's events, never listed</div>
      <ul class="mt-1 flex flex-col gap-0.5 text-[11px]">
        <li v-for="event in CALLBACK_EVENTS" :key="event" class="flex justify-between pr-2 text-night-200">
          <span>on {{ event }}</span><span class="text-night-400">{{ model.callbacks[event].length }}</span>
        </li>
      </ul>
      <Handle v-for="(event, i) in CALLBACK_EVENTS" :id="`cb-${event}`" :key="event" type="target" :position="Position.Right"
              class="chronos-handle chronos-handle-cb" :style="{ top: `${62 + i * 17}px` }" :title="`Callbacks on ${event}`" />
    </template>

    <template v-else>
      <div class="eyebrow flex items-center gap-1 text-red-300!"><PixelIcon name="fail" :size="11" />Fail rules</div>
      <div class="text-xs text-night-300">
        {{ model.fail.result === 'cooldown' ? `fails, locked ${humanDuration(formatDuration(model.fail.cooldown))}` : 'fails, can start again' }}
      </div>
      <div class="text-[10px] text-night-400">{{ model.fail.when.length }} when · {{ model.fail.unless.length }} unless · {{ model.fail.actions.length }} then</div>
      <Handle id="unless" type="target" :position="Position.Left" class="chronos-handle" title="Fail unless (requirements)" />
      <Handle id="when" type="target" :position="Position.Right" class="chronos-handle" title="Fail when (objectives)" />
      <Handle id="then" type="target" :position="Position.Bottom" class="chronos-handle" title="Then: what failing does (rewards, start_quest...)" />
    </template>
  </div>
</template>
