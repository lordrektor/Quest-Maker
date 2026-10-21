<script setup lang="ts">
import type { Line } from '../describe'
import MiniText from './MiniText.vue'

/**
 * Objective, requirement, reward or fail lines. A line naming a quest links to the creator (there is no page per
 * quest), unless `questLinks` is false.
 */
withDefaults(defineProps<{ lines: Line[]; marker?: string; questLinks?: boolean }>(), { questLinks: true })
</script>

<template>
  <ul class="space-y-2.5">
    <li v-for="(line, i) in lines" :key="i" class="flex gap-2.5 leading-snug">
      <span v-if="marker" aria-hidden="true" class="shrink-0 text-gold-400">{{ marker }}</span>
      <div class="min-w-0 break-words">
        <RouterLink
          v-if="line.quest && questLinks"
          to="/create"
          :title="`Open ${line.quest} in the creator`"
          class="text-night-100 underline decoration-gold-400/50 underline-offset-4 hover:decoration-gold-400"
        ><MiniText :text="line.mini" :placeholders="line.placeholders" /></RouterLink>
        <MiniText v-else :text="line.mini" :placeholders="line.placeholders" class="text-night-100" />
        <p v-if="line.hint" class="mt-0.5 text-xs text-night-400">{{ line.hint }}</p>
      </div>
    </li>
  </ul>
</template>
