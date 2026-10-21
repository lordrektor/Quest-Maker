<script setup lang="ts">
/**
 * A quest as a player reads it: name, description and badges, then objectives by stage, fail conditions, rewards
 * and requirements. Used by the showcase's example and the creator's preview.
 */
import { computed } from 'vue'
import {
  describeFail, list, objectiveStages, questBadges, requirementLines, rewardLines, str, type Tree,
} from '../describe'
import Chip from './Chip.vue'
import ItemIcon from './ItemIcon.vue'
import LineList from './LineList.vue'
import MiniText from './MiniText.vue'

const props = withDefaults(defineProps<{
  body: Tree
  /** Lines naming another quest link to the creator; false shows them as plain text. */
  questLinks?: boolean
  /** The heading level of the quest name (2 when the preview sits inside a page). */
  level?: 1 | 2
}>(), { questLinks: true, level: 1 })

const name = computed(() => str(props.body.name) ?? str(props.body.id) ?? 'Untitled quest')
const description = computed(() => list(props.body.description))
const badges = computed(() => questBadges(props.body))
const stages = computed(() => objectiveStages(props.body.objectives, props.body.stages))
const requirements = computed(() => requirementLines(props.body.requirements))
const rewards = computed(() => rewardLines(props.body.rewards))
const hasRewards = computed(() => Array.isArray(props.body.rewards) && props.body.rewards.length > 0)
const fail = computed(() => describeFail(props.body.fail))
const sub = computed(() => (props.level === 1 ? 'h2' : 'h3'))
const subsub = computed(() => (props.level === 1 ? 'h3' : 'h4'))
</script>

<template>
  <div>
    <header class="flex flex-col gap-5 sm:flex-row sm:items-start">
      <ItemIcon :item="str(body.icon) ?? 'minecraft:paper'" size="lg" />
      <div class="min-w-0 flex-1">
        <component :is="level === 1 ? 'h1' : 'h2'" class="text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
          <MiniText :text="name" />
        </component>
        <div v-if="description.length" class="mt-3 space-y-1 text-night-300 sm:text-lg">
          <MiniText v-for="(line, i) in description" :key="i" as="p" :text="line" />
        </div>
        <ul v-if="badges.length" class="mt-4 flex flex-wrap gap-2" aria-label="Quest details">
          <li v-for="badge in badges" :key="badge.label"><Chip :tone="badge.tone">{{ badge.label }}</Chip></li>
        </ul>
      </div>
    </header>

    <div class="mt-10 grid items-start gap-6 lg:grid-cols-3">
      <div class="space-y-6 lg:col-span-2">
        <section class="card p-5 sm:p-6">
          <component :is="sub" class="eyebrow mb-4">Objectives</component>
          <p v-if="stages.length === 0" class="text-night-400">This quest lists no objectives.</p>
          <ol v-else-if="stages.length > 1" class="space-y-6">
            <li v-for="(stage, i) in stages" :key="stage.stage" class="relative pl-9">
              <span
                aria-hidden="true"
                class="absolute top-0 left-0 grid size-6 place-items-center rounded-md border border-gold-400/50 bg-gold-900/60 font-display text-xs text-gold-300"
              >{{ i + 1 }}</span>
              <span v-if="i < stages.length - 1" aria-hidden="true" class="absolute top-7 bottom-[-1.25rem] left-3 w-px bg-night-700" />
              <component :is="subsub" class="mb-2 text-sm font-semibold text-night-200">Stage {{ i + 1 }}</component>
              <LineList :lines="stage.lines" :quest-links="questLinks" />
              <div v-if="stage.rewards.length" class="mt-2">
                <p class="text-xs text-night-400">When this stage is done:</p>
                <LineList :lines="stage.rewards" marker="+" :quest-links="questLinks" />
              </div>
            </li>
          </ol>
          <template v-else>
            <LineList :lines="stages[0]?.lines ?? []" :quest-links="questLinks" />
            <div v-if="stages[0]?.rewards.length" class="mt-2">
              <p class="text-xs text-night-400">When these are done:</p>
              <LineList :lines="stages[0].rewards" marker="+" :quest-links="questLinks" />
            </div>
          </template>
          <p v-if="stages.length > 1" class="mt-5 text-sm text-night-400">Stages unlock in order: finish every objective of one to move on.</p>
        </section>

        <section v-if="fail" class="card border-red-400/25 p-5 sm:p-6">
          <component :is="sub" class="eyebrow mb-4 text-red-300">Fail conditions</component>
          <div v-if="fail.when.length" class="mb-4">
            <component :is="subsub" class="mb-2 text-sm font-semibold text-night-200">Fails if you:</component>
            <LineList :lines="fail.when" marker="✕" :quest-links="questLinks" />
          </div>
          <div v-if="fail.unless.length" class="mb-4">
            <component :is="subsub" class="mb-2 text-sm font-semibold text-night-200">Fails unless:</component>
            <LineList :lines="fail.unless" marker="!" :quest-links="questLinks" />
          </div>
          <p class="text-sm text-night-300">{{ fail.result }}</p>
          <div v-if="fail.then.length" class="mt-4">
            <h4 class="mb-2 text-sm font-medium text-night-200">If it fails</h4>
            <LineList :lines="fail.then" marker="→" :quest-links="questLinks" />
          </div>
        </section>
      </div>

      <aside class="space-y-6">
        <section class="card p-5">
          <component :is="sub" class="eyebrow mb-4">Rewards</component>
          <LineList v-if="rewards.length" :lines="rewards" marker="+" :quest-links="questLinks" />
          <p v-else-if="hasRewards" class="text-night-400">A surprise: this quest's rewards are handed out in game.</p>
          <p v-else class="text-night-400">No rewards, just the glory.</p>
        </section>

        <section class="card p-5">
          <component :is="sub" class="eyebrow mb-4">Requirements</component>
          <LineList v-if="requirements.length" :lines="requirements" marker="◆" :quest-links="questLinks" />
          <p v-else class="text-night-400">None: anyone can start it.</p>
        </section>
      </aside>
    </div>
  </div>
</template>
