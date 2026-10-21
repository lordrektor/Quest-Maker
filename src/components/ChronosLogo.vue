<script setup lang="ts">
/** The Chronos hourglass: a 16x16 pixel hourglass in a gold gradient with glowing emerald sand (grid "logo" in data/icons.json). */
import { useId } from 'vue'
import { grid, runs } from '../pixels'

withDefaults(defineProps<{ size?: number | string; glow?: boolean; label?: string }>(), { size: 28, glow: true, label: undefined })

const id = useId()
const parts = runs(grid('logo'))
const fill = (c: string) =>
  ({ '#': `url(#${id}-gold)`, '+': `url(#${id}-light)`, '=': '#966812', k: '#0b0d11', s: '#7ee2b0', e: '#3fcf8e' })[c] ?? 'none'
</script>

<template>
  <svg :width="size" :height="size" viewBox="0 0 16 16" shape-rendering="crispEdges" :role="label ? 'img' : undefined"
       :aria-label="label" :aria-hidden="label ? undefined : 'true'" class="inline-block shrink-0 overflow-visible">
    <defs>
      <linearGradient :id="`${id}-gold`" x1="0" y1="0" x2="0" y2="16" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffd36e" />
        <stop offset="1" stop-color="#d99a1c" />
      </linearGradient>
      <linearGradient :id="`${id}-light`" x1="0" y1="0" x2="0" y2="16" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#fff1c8" />
        <stop offset="1" stop-color="#f5c45a" />
      </linearGradient>
      <filter :id="`${id}-glow`" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="0.9" />
      </filter>
    </defs>
    <g v-if="glow" :filter="`url(#${id}-glow)`" opacity="0.85">
      <rect v-for="(r, i) in parts.filter((r) => r.c === 'e')" :key="`g${i}`" :x="r.x - 0.5" :y="r.y - 0.5" :width="r.w + 1" height="2" fill="#3fcf8e" />
    </g>
    <rect v-for="(r, i) in parts" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="fill(r.c)" />
  </svg>
</template>
