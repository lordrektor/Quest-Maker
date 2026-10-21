<script setup lang="ts">
/**
 * A quest's requirements (or fail.unless, or a group's requirements) in the inspector: each with its Must / Must not switch,
 * opening on click and moving up or down; a group shows its requirements under it.
 */
import { computed } from 'vue'
import MiniText from '../../components/MiniText.vue'
import TypeIcon from '../../components/TypeIcon.vue'
import { describeRequirement, groupLabel } from '../../describe'
import { useEditor } from '../editor'
import { type EntryModel, groupMode, type Nid, requirementTree } from '../model'
import NotSwitch from './NotSwitch.vue'

const props = defineProps<{ quest: string; nids: Nid[]; empty: string; inGroup?: boolean }>()
const editor = useEditor()

const model = computed(() => editor.state.ws.quests[props.quest]?.model)
const items = computed(() => props.nids.map((nid) => ({ nid, entry: model.value?.entries[nid] }))
  .filter((x): x is { nid: Nid; entry: EntryModel } => !!x.entry))

function sentence(nid: Nid) {
  return model.value ? describeRequirement(requirementTree(model.value, nid)).mini : ''
}
</script>

<template>
  <ul class="flex flex-col gap-1" :class="inGroup ? 'ml-3 border-l border-sky-900 pl-2' : ''">
    <li v-for="{ nid, entry } in items" :key="nid" class="flex flex-col gap-1">
      <div class="flex items-center gap-1">
        <TypeIcon v-if="!entry.members" category="requirement" :type="entry.type" :plain="12" />
        <NotSwitch :not="entry.not === true" :label="entry.members ? 'The player, for this group' : 'The player'" @update="(v) => editor.setNot(quest, nid, v)" />
        <button type="button" class="min-w-0 flex-1 truncate rounded px-1 text-left text-xs hover:bg-night-800"
                @click="editor.state.selection = { kind: 'part', quest, key: nid }">
          <span v-if="entry.members" class="text-sky-300">{{ groupLabel(groupMode(entry), entry.not === true) }} ({{ entry.members.length }}) </span>
          <MiniText v-else :text="sentence(nid)" />
        </button>
        <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Earlier" @click="editor.shiftEntry(quest, nid, -1)">↑</button>
        <button type="button" class="px-1 text-night-400 hover:text-night-100" aria-label="Later" @click="editor.shiftEntry(quest, nid, 1)">↓</button>
      </div>
      <RequirementList v-if="entry.members" :quest="quest" :nids="entry.members" in-group
                       empty="Empty: drop requirements on the group, or wire them to its left dot." />
    </li>
    <li v-if="items.length === 0" class="text-xs text-night-400">{{ empty }}</li>
  </ul>
</template>
