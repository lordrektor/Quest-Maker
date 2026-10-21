<script setup lang="ts">
/**
 * A pixel icon from data/icons.json: '#' = currentColor, '+' = currentColor (dimmed), 'o' = accent, 'k' = dark ink.
 * `coloured` paints it by meaning instead, in its two flat hues from data/icon-hues.json (the type symbols' palette).
 * Decorative unless it has a label.
 */
import { computed } from 'vue'
import { grid, iconHues, runs } from '../pixels'

const props = withDefaults(defineProps<{
  name: string
  size?: number | string
  accent?: string
  label?: string
  coloured?: boolean
}>(), {
  size: 16,
  accent: 'var(--color-emerald-400)',
})

const rows = computed(() => grid(props.name))
const parts = computed(() => runs(rows.value))
const n = computed(() => rows.value.length || 12)
const hues = computed(() => (props.coloured ? iconHues(props.name) : undefined))
const fill = (c: string) =>
  c === 'o' ? (hues.value?.accent ?? props.accent) : c === 'k' ? 'var(--color-night-950)' : (hues.value?.main ?? 'currentColor')
</script>

<template>
  <svg
    :width="size"
    :height="size"
    :viewBox="`0 0 ${n} ${n}`"
    shape-rendering="crispEdges"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    class="inline-block shrink-0"
  >
    <rect v-for="(r, i) in parts" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="fill(r.c)" :fill-opacity="r.c === '+' ? 0.55 : undefined" />
  </svg>
</template>
