<script setup lang="ts">
/** A quest the workspace's quests name but that is not on it: add it to edit it (opened from D1, or new). */
import { Handle, Position, type NodeProps } from '@vue-flow/core'
import { computed } from 'vue'
import { useEditor } from '../editor'
import type { GhostData } from './flow'

const props = defineProps<NodeProps<GhostData>>()
const editor = useEditor()
const known = computed(() => editor.state.known[props.data.quest])
</script>

<template>
  <div class="w-[220px] rounded-xl border-2 border-dashed border-night-600 bg-night-900/70 px-3 py-2" :class="(selected || data.chosen) ? 'border-gold-400' : ''">
    <div class="text-[10px] tracking-wide text-night-400 uppercase">Not on this workspace</div>
    <div class="font-mono text-sm break-all text-night-200">{{ data.quest }}</div>
    <div v-if="known === false" class="text-[11px] text-gold-300">not in the database yet</div>
    <button
      type="button"
      class="nodrag mt-1 rounded-md border border-night-600 px-2 py-0.5 text-xs hover:border-gold-400"
      @click.stop="editor.addQuest(data.quest)"
    >Add to workspace</button>
    <Handle id="in" type="target" :position="Position.Left" class="chronos-handle chronos-handle-in" />
    <Handle id="ghost-out" type="source" :position="Position.Right" class="chronos-handle" :connectable="false" />
  </div>
</template>
