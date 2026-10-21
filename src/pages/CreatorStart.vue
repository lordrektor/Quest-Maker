<script setup lang="ts">
/**
 * The way into a workspace: pick one of your own (the ones you created), or type a name to open someone else's or to
 * start a new one. Only your own workspaces are listed; nobody else's ever are.
 */
import PixelIcon from '../components/PixelIcon.vue'
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { fetchMyWorkspaces } from '../creator/api'
import type { WorkspaceSummary } from '../../shared/creator'
import { usePageTitle } from '../title'

usePageTitle(() => 'Creator')

const NAME = /^[a-z0-9_-]{1,64}$/

const router = useRouter()
const input = ref<HTMLInputElement | null>(null)
const name = ref('')
const mine = ref<WorkspaceSummary[] | null>(null)
const loadError = ref<string | null>(null)

const clean = computed(() => name.value.trim().toLowerCase())
const valid = computed(() => NAME.test(clean.value))
const problem = computed(() => {
  if (clean.value === '' || valid.value) return null
  if (clean.value.length > 64) return 'At most 64 characters.'
  return 'Use only a–z, 0–9, _ and -.'
})

function onInput(event: Event) {
  name.value = (event.target as HTMLInputElement).value.toLowerCase()
}

async function open(workspace = clean.value) {
  if (!NAME.test(workspace)) {
    input.value?.focus()
    return
  }
  await router.push({ name: 'workspace', params: { workspace } })
}

function when(at: number): string {
  return new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

onMounted(async () => {
  try {
    mine.value = await fetchMyWorkspaces()
  } catch (e) {
    loadError.value = e instanceof Error ? e.message : String(e)
    mine.value = []
  }
  if (mine.value.length === 0) input.value?.focus()
})
</script>

<template>
  <section class="mx-auto max-w-xl pt-4 sm:pt-12" aria-labelledby="creator-title">
    <div class="card px-6 py-8 sm:px-8 sm:py-10">
      <p class="eyebrow mb-2 flex items-center gap-2"><PixelIcon name="workspace" :size="16" />Creator</p>
      <h1 id="creator-title" class="text-2xl font-semibold text-night-100">Your workspaces</h1>
      <p class="mt-3 text-night-300">
        A workspace is one canvas holding several quests and the lines between them.
      </p>

      <div class="mt-6" aria-live="polite">
        <p v-if="mine === null" class="text-sm text-night-400" role="status">Loading your workspaces…</p>
        <p v-else-if="loadError" class="text-sm text-red-300" role="alert">Could not load your workspaces: {{ loadError }}</p>
        <p v-else-if="mine.length === 0" class="text-sm text-night-400">You have no workspaces yet: name one below to start.</p>
        <ul v-else class="flex flex-col gap-2">
          <li v-for="ws in mine" :key="ws.name">
            <RouterLink
              :to="{ name: 'workspace', params: { workspace: ws.name } }"
              class="card-link flex items-center justify-between gap-3 rounded-xl border border-night-700 bg-night-850 px-4 py-3"
            >
              <span class="min-w-0">
                <span class="block truncate font-mono text-night-100">{{ ws.name }}</span>
                <span class="block text-xs text-night-400">
                  {{ ws.quests }} quest{{ ws.quests === 1 ? '' : 's' }} · saved {{ when(ws.updatedAt) }}<template v-if="ws.updatedBy"> by {{ ws.updatedBy }}</template>
                </span>
              </span>
              <span class="shrink-0 text-sm text-gold-300" aria-hidden="true">Open →</span>
            </RouterLink>
          </li>
        </ul>
      </div>

      <form class="mt-8 border-t border-night-700 pt-6" novalidate @submit.prevent="open()">
        <label for="workspace" class="mb-2 block text-sm font-medium text-night-200">New workspace, or someone else's by name</label>
        <div class="flex flex-col gap-3 sm:flex-row">
          <input
            id="workspace"
            ref="input"
            :value="name"
            type="text"
            autocomplete="off"
            autocapitalize="none"
            spellcheck="false"
            maxlength="64"
            placeholder="e.g. hydra_saga"
            :aria-invalid="problem !== null"
            aria-describedby="workspace-help workspace-error"
            class="min-w-0 flex-1 rounded-xl border border-night-600 bg-night-900 px-4 py-3 font-mono text-lg text-night-100 placeholder:text-night-700 focus:border-gold-400 focus:outline-none aria-[invalid=true]:border-red-400"
            @input="onInput"
          />
          <button
            type="submit"
            :disabled="!valid"
            class="rounded-xl bg-gold-400 px-5 py-3 font-semibold text-night-950 transition hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
          >Open or create</button>
        </div>
        <p id="workspace-help" class="mt-2 text-sm text-night-400">Lowercase letters, digits, <code>_</code> and <code>-</code>, up to 64 characters.
          Other people's workspaces are never listed: you need their name.</p>
        <p id="workspace-error" class="mt-2 min-h-5 text-sm text-red-300" role="alert" aria-live="polite">{{ problem }}</p>
      </form>
    </div>
    <p class="mt-6 text-center text-sm text-night-400">
      Saving writes to this site only. In game, <code class="text-night-300">/chronos cl download ws &lt;name&gt;</code> brings a workspace's quests onto the server.
    </p>
  </section>
</template>
