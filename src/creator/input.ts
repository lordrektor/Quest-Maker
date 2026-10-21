/**
 * What was typed into a field, turned into the value stored, like the in-game editor (ParamInput.java): numbers may
 * have _ or , in them, durations are written the plugin's way, keys are lower-cased and a field that takes one
 * plugin's keys only refuses others at once.
 */
import type { ParamDto } from '../../shared/creator'
import type { Value } from '../../shared/quest/canonical'
import { formatDuration, parseDuration } from '../../shared/quest/durations'
import { namespaceError } from '../../shared/quest/validate'

/** Ids the in-game editor never gives a new quest (EditorService.RESERVED). */
export const RESERVED_IDS = ['new', 'cancel']

/** {@return a typed id the way the in-game editor reads it: trimmed, lower-cased, spaces as _ (EditorService.id)} */
export function typedId(raw: string): string {
  return raw.trim().toLowerCase().replace(/ /g, '_')
}

/** Lists of text lines (EditorUi.LINE_LISTS): commas stay in a line, and a line may repeat. */
export const LINE_LISTS = ['description', 'lore']

export function isLineList(param: ParamDto): boolean {
  return param.kind === 'STRING_LIST' && LINE_LISTS.includes(param.name)
}

export type Parsed = { value: Value } | { error: string }

/** {@return the value to store, or why the text does not fit} @param raw What was typed (not empty). */
export function parseInput(param: ParamDto, raw: string): Parsed {
  const text = raw.trim()
  if (text === '') return { error: 'Nothing was typed.' }
  switch (param.kind) {
    case 'INTEGER': {
      const clean = text.replace(/[_,]/g, '')
      if (!/^[+-]?\d+$/.test(clean) || !Number.isSafeInteger(Number(clean))) return { error: `'${text}' is not a whole number.` }
      const value = Number(clean)
      if (param.min !== null && value < param.min) return { error: `It must be at least ${param.min}.` }
      return { value }
    }
    case 'DECIMAL': {
      const clean = text.replace(/,/g, '.')
      const value = Number(clean)
      if (clean === '' || !Number.isFinite(value) || !/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(clean)) return { error: `'${text}' is not a number.` }
      if (param.min !== null && value < param.min) return { error: `It must be at least ${param.min}.` }
      return { value }
    }
    case 'BOOLEAN': {
      const lower = text.toLowerCase()
      if (['true', 'yes', 'on'].includes(lower)) return { value: true }
      if (['false', 'no', 'off'].includes(lower)) return { value: false }
      return { error: 'Type true or false.' }
    }
    case 'DURATION':
      try {
        return { value: formatDuration(parseDuration(text)) }
      } catch (e) {
        return { error: (e as Error).message }
      }
    case 'CHOICE': {
      const choices = param.choices ?? []
      if (choices.includes(text)) return { value: text }
      if (choices.includes(text.toLowerCase())) return { value: text.toLowerCase() }
      return { error: `Choose one of ${choices.join(', ')}.` }
    }
    case 'ITEM':
    case 'BLOCK':
    case 'ITEM_LIST':
    case 'BLOCK_LIST':
    case 'ENTITY_LIST':
    case 'QUEST': {
      const error = namespaceError(param, text)
      return error ? { error } : { value: text.toLowerCase() }
    }
    default:
      return { value: text }
  }
}

/** {@return the values typed for a list: one per line, and also split at commas unless it is a list of text lines} */
export function splitValues(text: string, lines: boolean): string[] {
  const values: string[] = []
  for (const line of text.split(/\r?\n/)) {
    for (const part of lines ? [line] : line.split(',')) {
      if (part.trim() !== '') values.push(lines ? part.trimEnd() : part.trim())
    }
  }
  return values
}
