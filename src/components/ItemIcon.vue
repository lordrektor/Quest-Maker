<script setup lang="ts">
/**
 * An item in an inventory-slot tile: its own picture (the materials of the quest type icons, data/item-icons.json), else
 * the pixel icon of its family (sword, tool, potion, gem, block...) in the colour of its material, or its initials when
 * no family fits. Original art: no game textures.
 */
import { computed } from 'vue'
import { prettyKey } from '../describe'
import { grid, ITEM_PALETTE, itemArt, runs } from '../pixels'

const props = withDefaults(defineProps<{ item: string | null | undefined; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })

const name = computed(() => prettyKey(props.item || 'minecraft:paper'))
const art = computed(() => itemArt(props.item))
const parts = computed(() => (art.value.grid ? runs(art.value.grid) : art.value.icon ? runs(grid(art.value.icon)) : []))
const initials = computed(() => {
  const words = name.value.replace('(any)', '').trim().split(/\s+/).filter(Boolean)
  const first = words[0] ?? '?'
  const letters = words.length > 1 ? first.charAt(0) + (words[words.length - 1] ?? '').charAt(0) : first.slice(0, 2)
  return letters.toUpperCase()
})
const box = computed(() => ({ sm: 'size-10 text-xs', md: 'size-12 text-sm', lg: 'size-16 text-base sm:size-20 sm:text-lg' })[props.size])
const fill = (c: string) => (c === 'o' ? '#8b5a2b' : c === 'k' ? 'var(--color-night-950)' : ITEM_PALETTE[c] ?? art.value.tint)
</script>

<template>
  <span
    role="img"
    :aria-label="`Icon: ${name}`"
    :title="name"
    class="inline-grid shrink-0 place-items-center rounded-lg border border-night-700 bg-night-850 font-display tracking-tight select-none"
    :class="box"
    :style="{ boxShadow: 'inset 0 -3px 0 var(--color-night-950), inset 0 2px 0 var(--color-night-700)', color: art.tint }"
  >
    <svg v-if="art.icon" viewBox="0 0 12 12" shape-rendering="crispEdges" class="size-[62%]" aria-hidden="true">
      <rect v-for="(r, i) in parts" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="fill(r.c)" :fill-opacity="r.c === '+' ? 0.55 : undefined" />
    </svg>
    <template v-else>{{ initials }}</template>
  </span>
</template>
