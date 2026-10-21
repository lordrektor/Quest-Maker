/** Durations like the plugin's (Durations.java): 30s, 90m, 1d12h, 2w; "0" is none. */

const FULL = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/
const UNIT_SECONDS = [7 * 86_400, 86_400, 3_600, 60, 1]
const UNIT_NAMES = ['w', 'd', 'h', 'm', 's']

/** {@return the duration in seconds} @throws Error with the plugin's message when it does not read */
export function parseDuration(raw: string): number {
  const text = raw.replace(/ /g, '').toLowerCase()
  if (text === '0') return 0
  const m = FULL.exec(text)
  if (text === '' || !m) throw new Error(`'${raw}' is not a duration (examples: 30s, 90m, 2h, 1d12h, 2w)`)
  let seconds = 0
  for (let i = 0; i < UNIT_SECONDS.length; i++) {
    const group = m[i + 1]
    if (group !== undefined) seconds += Number(group) * UNIT_SECONDS[i]!
  }
  if (!Number.isSafeInteger(seconds)) throw new Error(`'${raw}' is too long`)
  return seconds
}

/** {@return seconds written the way the plugin writes them: 1d12h, 90m becomes 1h30m, 0 is "0"} */
export function formatDuration(seconds: number): string {
  let rest = Math.max(0, Math.floor(seconds))
  if (rest === 0) return '0'
  let out = ''
  for (let i = 0; i < UNIT_SECONDS.length; i++) {
    const count = Math.floor(rest / UNIT_SECONDS[i]!)
    if (count > 0) {
      out += `${count}${UNIT_NAMES[i]}`
      rest -= count * UNIT_SECONDS[i]!
    }
  }
  return out
}

/** {@return the duration, or null when it does not read} */
export function tryDuration(raw: string): number | null {
  try {
    return parseDuration(raw)
  } catch {
    return null
  }
}
