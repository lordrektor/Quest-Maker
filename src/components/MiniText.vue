<script setup lang="ts">
import { computed } from 'vue'
import { readableOn, renderMiniMessage, type Segment } from '../minimessage'

/** Placeholders every quest text may use, filled for a page nobody is playing. */
const DEFAULTS: Record<string, string> = { player: 'adventurer', prefix: '', quest: 'this quest' }

const props = withDefaults(defineProps<{
  /** MiniMessage text; tags are rendered, nothing becomes HTML. */
  text: string | null | undefined
  placeholders?: Record<string, string>
  /** The background the text sits on: dark colours are lifted to stay readable on it. */
  background?: string
  as?: string
}>(), { placeholders: () => ({}), background: '#12151b', as: 'span' })

const segments = computed(() => renderMiniMessage(props.text ?? '', { placeholders: { ...DEFAULTS, ...props.placeholders } }))

function style(s: Segment): Record<string, string> {
  const css: Record<string, string> = {}
  if (s.color) css.color = readableOn(s.color, props.background)
  if (s.bold) css.fontWeight = '700'
  if (s.italic) css.fontStyle = 'italic'
  const lines = [s.underlined && 'underline', s.strikethrough && 'line-through'].filter(Boolean)
  if (lines.length) css.textDecorationLine = lines.join(' ')
  return css
}
</script>

<template>
  <component :is="as"><template v-for="(s, i) in segments" :key="i"><br v-if="s.text === '\n'"><span v-else :style="style(s)">{{ s.text }}</span></template></component>
</template>
