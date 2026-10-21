<script setup lang="ts">
/**
 * A quest type's symbol (an objective, requirement or reward type), painted by meaning in its own flat colours. The
 * category shows on the tile, a thin border and a faint tint in its colour: objectives gold, requirements teal, rewards
 * violet. In a tile like ItemIcon's, or bare (`plain`) inside text and chips, where the list or chip around it says the
 * category. Things that are items (a quest's icon, an item argument) use ItemIcon instead.
 */
import { computed } from 'vue'
import { runs } from '../pixels'
import { categoryTint, type TypeCategory, typeSymbol } from '../typeIcons'

const props = withDefaults(defineProps<{
  category: TypeCategory
  type: string
  size?: 'sm' | 'md' | 'lg'
  /** Just the symbol, at a pixel size (inline in a line of text or a chip). */
  plain?: number
  label?: string
}>(), { size: 'md' })

const symbol = computed(() => typeSymbol(props.category, props.type))
const parts = computed(() => runs(symbol.value.grid))
const fill = (c: string) => (c === 'o' ? symbol.value.accent : symbol.value.main)
const box = computed(() => ({ sm: 'size-10', md: 'size-12', lg: 'size-16' })[props.size])
const tile = computed(() => ({
  ...categoryTint(props.category),
  boxShadow: 'inset 0 -3px 0 var(--color-night-950), inset 0 2px 0 var(--color-night-700)',
}))
</script>

<template>
  <svg
    v-if="plain"
    :width="plain"
    :height="plain"
    viewBox="0 0 12 12"
    shape-rendering="crispEdges"
    class="inline-block shrink-0"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <rect v-for="(r, i) in parts" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="fill(r.c)" :fill-opacity="r.c === '+' ? 0.55 : undefined" />
  </svg>
  <span
    v-else
    role="img"
    :aria-label="label ?? `${category} type ${type}`"
    :title="label ?? type"
    class="inline-grid shrink-0 place-items-center rounded-lg border select-none"
    :class="box"
    :style="tile"
  >
    <svg viewBox="0 0 12 12" shape-rendering="crispEdges" class="size-[62%]" aria-hidden="true">
      <rect v-for="(r, i) in parts" :key="i" :x="r.x" :y="r.y" :width="r.w" height="1" :fill="fill(r.c)" :fill-opacity="r.c === '+' ? 0.55 : undefined" />
    </svg>
  </span>
</template>
