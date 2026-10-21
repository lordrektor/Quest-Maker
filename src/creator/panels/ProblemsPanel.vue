<script setup lang="ts">
/** Every problem of the workspace's quests, as the game would report them; click one to go to its part. */
import { computed } from 'vue'
import { useEditor } from '../editor'

const editor = useEditor()
const groups = computed(() => {
  const byQuest = new Map<string, typeof editor.checked.value.problems>()
  for (const p of editor.checked.value.problems) (byQuest.get(p.quest) ?? byQuest.set(p.quest, []).get(p.quest)!).push(p)
  for (const list of byQuest.values()) list.sort((a, b) => Number(b.error) - Number(a.error))
  return [...byQuest.entries()]
})
const server = computed(() => Object.entries(editor.state.serverProblems ?? {}).filter(([, list]) => list.length > 0))

function go(quest: string, key: string) {
  const box = editor.state.ws.boxes[quest]
  if (box && !box.open) editor.toggleBox(quest, true)
  editor.state.selection = key === 'start' ? { kind: 'box', quest } : { kind: 'part', quest, key }
}
</script>

<template>
  <section aria-label="Problems" class="flex flex-col gap-3 p-3 text-sm">
    <p v-if="!editor.catalog.value?.ready" class="rounded-md border border-gold-900 bg-gold-900/30 p-2 text-xs text-gold-200">
      Types are not checked until /chronos cl types has been run in game. The download checks everything again.</p>
    <p v-if="groups.length === 0 && server.length === 0" class="text-night-400">No problems found.</p>
    <div v-if="server.length" class="rounded-md border border-red-900 p-2">
      <p class="eyebrow mb-1 text-red-300!">The server refused the save</p>
      <ul class="flex flex-col gap-1 text-xs">
        <template v-for="[quest, list] in server" :key="quest">
          <li v-for="(p, i) in list" :key="`${quest}-${i}`" :class="p.error ? 'text-red-200' : 'text-gold-200'">
            <span class="font-mono">{{ quest }} {{ p.path }}</span> {{ p.message }}
          </li>
        </template>
      </ul>
    </div>
    <div v-for="[quest, list] in groups" :key="quest">
      <p class="mb-1 font-mono text-xs text-night-300">{{ quest }}</p>
      <ul class="flex flex-col gap-1">
        <li v-for="(p, i) in list" :key="i">
          <button type="button" class="w-full rounded-md border px-2 py-1 text-left text-xs"
                  :class="p.error ? 'border-red-900 bg-red-950/40 text-red-200 hover:border-red-400' : 'border-gold-900 bg-gold-900/20 text-gold-200 hover:border-gold-400'"
                  @click="go(p.quest, p.key)">
            <span class="mr-1 font-semibold">{{ p.error ? 'Error' : 'Warning' }}</span>
            <span v-if="p.path" class="font-mono text-[10px] opacity-70">{{ p.path }}</span> {{ p.message }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
