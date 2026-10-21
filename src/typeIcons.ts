/**
 * The symbols of quest types (src/data/type-icons.json, written by scripts/type_icons/make_type_icons.py): one 12x12
 * symbol per type by meaning, keyed by category and type id, in the Tyche website's style. Original art. A type the
 * website does not know yet (another plugin's) gets its category's fallback: target, search or chest.
 *
 * Symbols are painted by meaning in at most three flat colours from a small palette: a main hue ('#', and '+' dimmed)
 * and one accent ('o'). The category is never the symbol's colour: TypeIcon shows it on the tile.
 */
import data from './data/type-icons.json'
import type { Grid } from './pixels'

export type TypeCategory = 'objective' | 'requirement' | 'reward'

const TYPES = data.types as Record<TypeCategory, Record<string, string>>
const SYMBOLS = data.symbols as Record<string, Grid>
const HUES = data.colours as Record<string, { main: string; accent: string }>
export const TYPE_FALLBACKS = data.fallbacks as Record<TypeCategory, string>

/** The flat hues symbols are painted in, by name: steel blades, a red heart, a gold coin, a blue drop... */
export const TYPE_PALETTE = data.palette as Record<string, string>

export interface TypeSymbol {
  /** The symbol's name: a base, or base+badge (coin+plus). */
  name: string
  grid: Grid
  /** '#' in this colour, '+' in it dimmed. */
  main: string
  /** 'o' in this colour. */
  accent: string
  /** False for a type the website does not know (its category's fallback). */
  known: boolean
}

/**
 * {@return the category on a tile or chip around a type: a thin border and a faint tint in the category's colour
 * (objectives gold, requirements teal, rewards violet)}
 */
export function categoryTint(category: TypeCategory): { borderColor: string; backgroundColor: string } {
  const colour = `var(--color-type-${category})`
  return {
    borderColor: `color-mix(in srgb, ${colour} 55%, transparent)`,
    backgroundColor: `color-mix(in srgb, ${colour} 7%, var(--color-night-850))`,
  }
}

/** {@return a type's symbol, or its category's fallback} */
export function typeSymbol(category: TypeCategory, type: string): TypeSymbol {
  const own = TYPES[category]?.[type]
  const name = own ?? TYPE_FALLBACKS[category]
  const hues = HUES[name]
  const hue = (h: string | undefined) => TYPE_PALETTE[h ?? 'steel'] ?? 'currentColor'
  return {
    name,
    grid: SYMBOLS[name] ?? [],
    main: hue(hues?.main),
    accent: hue(hues?.accent),
    known: own !== undefined,
  }
}
