<script setup lang="ts">
/**
 * The way into the creator: a six-digit code from /chronos cl otp. It signs in by itself once six
 * digits are typed or pasted.
 */
import PixelIcon from '../components/PixelIcon.vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { isCode, login, safeNext, type LoginFailure } from '../auth'
import { usePageTitle } from '../title'

usePageTitle(() => 'Sign in')

const route = useRoute()
const router = useRouter()
const input = ref<HTMLInputElement | null>(null)
const code = ref('')
const busy = ref(false)
const failure = ref<LoginFailure | null>(null)
const waitLeft = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const digits = computed(() => code.value.replace(/\D/g, ''))
const ready = computed(() => isCode(digits.value) && !busy.value && waitLeft.value === 0)
const message = computed(() => {
  const f = failure.value
  if (!f) return null
  switch (f.kind) {
    case 'wrong':
      return 'That code is wrong, already used, or expired. Run /chronos cl otp for a new one.'
    case 'limited':
      return `Too many wrong codes. Try again in ${formatWait(waitLeft.value)}.`
    case 'offline':
      return 'The server could not be reached. Check your connection and try again.'
    case 'error':
      return `Signing in failed: ${f.message}`
  }
  return null
})

function formatWait(seconds: number): string {
  if (seconds <= 0) return 'a moment'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}

/** Keeps digits only, shown as 123 456. */
function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(0, 6)
  code.value = raw.length > 3 ? `${raw.slice(0, 3)} ${raw.slice(3)}` : raw
  if (failure.value?.kind === 'wrong') failure.value = null
  if (raw.length === 6) void submit()
}

async function submit() {
  if (!ready.value) return
  busy.value = true
  failure.value = null
  const result = await login(digits.value)
  busy.value = false
  if (!result) {
    await router.replace(safeNext(route.query.next, '/create'))
    return
  }
  failure.value = result
  code.value = ''
  if (result.kind === 'limited') startWait(result.retryAfter)
  await nextTick()
  input.value?.focus()
}

function startWait(seconds: number) {
  waitLeft.value = seconds
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    waitLeft.value = Math.max(0, waitLeft.value - 1)
    if (waitLeft.value === 0 && timer) {
      clearInterval(timer)
      timer = null
      failure.value = null
    }
  }, 1000)
}

onMounted(() => input.value?.focus())
onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})
</script>

<template>
  <section class="mx-auto max-w-md pt-4 sm:pt-12" aria-labelledby="login-title">
    <div class="card px-6 py-8 sm:px-8 sm:py-10">
      <p class="eyebrow mb-2 flex items-center gap-2"><PixelIcon name="key" :size="16" />Sign in</p>
      <h1 id="login-title" class="text-2xl font-semibold text-night-100">Enter your code</h1>
      <p class="mt-3 text-night-300">
        In game, run <code class="rounded bg-night-800 px-1.5 py-0.5 text-gold-300">/chronos cl otp</code>.
        The code works once, for a few minutes.
      </p>

      <form class="mt-8" novalidate @submit.prevent="submit">
        <label for="otp" class="mb-2 block text-sm font-medium text-night-200">Six-digit code</label>
        <input
          id="otp"
          ref="input"
          :value="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="7"
          placeholder="000 000"
          :disabled="busy || waitLeft > 0"
          :aria-invalid="failure?.kind === 'wrong'"
          aria-describedby="otp-help otp-error"
          class="w-full rounded-xl border border-night-600 bg-night-900 px-4 py-4 text-center font-mono text-3xl tracking-[0.35em] text-night-100 placeholder:text-night-700 focus:border-gold-400 focus:outline-none disabled:opacity-60 aria-[invalid=true]:border-red-400"
          @input="onInput"
        />
        <p id="otp-help" class="mt-2 text-sm text-night-400">It signs you in as the player who asked for it.</p>
        <p id="otp-error" class="mt-3 min-h-6 text-sm text-red-300" role="alert" aria-live="assertive">{{ message }}</p>

        <button
          type="submit"
          :disabled="!ready"
          class="mt-4 w-full rounded-xl bg-gold-400 px-4 py-3 font-semibold text-night-950 transition hover:bg-gold-300 disabled:cursor-not-allowed disabled:opacity-50"
        >{{ busy ? 'Checking…' : 'Sign in' }}</button>
      </form>
    </div>
    <p class="mt-6 text-center text-sm text-night-400">Only people with a code can create quests for this server. <RouterLink to="/" class="text-night-300 underline decoration-gold-400/50 underline-offset-4 hover:text-night-100">See what Chronos can do</RouterLink></p>
  </section>
</template>
