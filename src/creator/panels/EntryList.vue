<script setup lang="ts">
/** A short list of a quest's entries in the inspector: each opens on click, and moves up or down among its siblings. */
import { computed } from 'vue'
import MiniText from '../../components/MiniText.vue'
import TypeIcon from '../../components/TypeIcon.vue'
import { describeAction, describeObjective, describeRequirement } from '../../describe'
import { useEditor } from '../editor'
import { entryTree, type EntryModel, type Nid } from '../model'

const props = defineProps<{ quest: string; nids: Nid[]; empty: string }>()
const editor = useEditor()

const items = computed(() => {
  const model = editor.state.ws.quests[props.quest]?.model
  return props.nids.map((nid) => ({ nid, entry: model?.entries[nid] })).filter((x): x is { nid: Nid; entry: EntryModel } => !!x.entry)
})

function sentence(e: EntryModel) {
  const tree = entryTree(e)
  if (e.category === 'objective') return describeObjective(e.objectiveId ?? 'objective', tree)
  if (e.category === 'requirement') return describeRequirement(tree)
  return describeAction(tree)
}
</script>

<template>
  <ul class="flex flex-col gap-1">
    <li v-for="{ nid, entry } in items" :key="nid" class="flex items-center gap-1">
      <TypeIcon :category="entry.category" :type="entry.type" :plain="12" />
      <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
              @click="editor.state.selection = { kind: 'part', quest, key: nid }"><MiniText :text="sentence(entry).mini" /></button>
      <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(quest, nid, -1)">↑</button>
      <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(quest, nid, 1)">↓</button>
    </li>
    <li v-if="items.length === 0" class="text-xs text-night-400">{{ empty }}</li>
  </ul>
</template>
