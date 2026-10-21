/** The site's reads of the Worker (`/api/...`), for a signed-in person: a 401 means the session ended. */
import { onBeforeUnmount, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import { signedOut } from './auth'

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }

  get notFound(): boolean {
    return this.status === 404
  }
}

/** GETs `/api/<path>` as JSON; a failed answer becomes an {@link ApiError}. */
export async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/${path}`, { headers: { accept: 'application/json' }, signal })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    throw new ApiError(0, 'The server could not be reached.')
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // An answer that is not JSON is reported by its status below
  }
  // The session ended (expired, or signed out elsewhere): App.vue sends the visitor to the code page
  if (response.status === 401) signedOut()
  if (!response.ok) {
    const error = body !== null && typeof body === 'object' && 'error' in body ? String((body as { error: unknown }).error) : response.statusText
    throw new ApiError(response.status, error || `HTTP ${response.status}`)
  }
  return body as T
}

export interface Loaded<T> {
  data: ShallowRef<T | null>
  error: ShallowRef<ApiError | null>
  loading: Ref<boolean>
  reload: () => void
}

/**
 * Loads `fetcher(key)` now and again whenever `key()` changes; an older answer that arrives late is dropped, and
 * a request still running when the page goes away is cancelled.
 */
export function useLoader<T, K>(key: () => K, fetcher: (key: K, signal: AbortSignal) => Promise<T>): Loaded<T> {
  const data = shallowRef<T | null>(null)
  const error = shallowRef<ApiError | null>(null)
  const loading = ref(true)
  let controller: AbortController | null = null

  async function load() {
    controller?.abort()
    const mine = new AbortController()
    controller = mine
    loading.value = true
    error.value = null
    try {
      const result = await fetcher(key(), mine.signal)
      if (controller !== mine) return
      data.value = result
    } catch (e) {
      if (controller !== mine || (e instanceof DOMException && e.name === 'AbortError')) return
      data.value = null
      error.value = e instanceof ApiError ? e : new ApiError(0, e instanceof Error ? e.message : String(e))
    } finally {
      if (controller === mine) loading.value = false
    }
  }

  watch(key, load, { immediate: true })
  onBeforeUnmount(() => controller?.abort())
  return { data, error, loading, reload: () => void load() }
}
