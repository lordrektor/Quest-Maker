<script setup lang="ts">
import { computed } from 'vue'
import type { Badge } from '../describe'

const props = withDefaults(defineProps<{ tone?: Badge['tone'] }>(), { tone: 'neutral' })

const TONES: Record<Badge['tone'], string> = {
  easy: 'border-emerald-400/40 bg-emerald-900/50 text-emerald-300',
  medium: 'border-gold-400/40 bg-gold-900/50 text-gold-300',
  hard: 'border-red-400/40 bg-red-950/60 text-red-300',
  other: 'border-sky-400/40 bg-sky-950/60 text-sky-300',
  accent: 'border-gold-400/40 bg-gold-900/40 text-gold-200',
  neutral: 'border-night-600 bg-night-800 text-night-200',
}
const classes = computed(() => TONES[props.tone])
</script>

<template>
  <span class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap" :class="classes"><slot /></span>
</template>
