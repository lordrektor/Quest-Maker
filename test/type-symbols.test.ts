import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import typeIds from './fixtures/type-ids.json'
import data from '../src/data/type-icons.json'
import iconHueNames from '../src/data/icon-hues.json'
import { hasIcon, iconHues } from '../src/pixels'
import { categoryTint, TYPE_FALLBACKS, TYPE_PALETTE, type TypeCategory, typeSymbol } from '../src/typeIcons'

/** Every type the plugin has today (TypeIcons, the Tyche NPC types included): id and category. */
const TYPES = typeIds as { id: string; category: TypeCategory }[]
const CATEGORIES: TypeCategory[] = ['objective', 'requirement', 'reward']
const SYMBOLS = data.symbols as Record<string, string[]>
const HUES = data.colours as Record<string, { main: string; accent: string }>

/** The tile behind a symbol: night-850, tinted 7% with each category's colour (src/style.css). */
const NIGHT_850 = '#171b22'
const CATEGORY_COLOURS = { objective: '#f5b83d', requirement: '#2fc7b3', reward: '#a78bfa' }
const TILES = [NIGHT_850, ...Object.values(CATEGORY_COLOURS).map((c) => mix(c, NIGHT_850, 0.07))]

function channels(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
}

/** {@return a over b at alpha t} */
function mix(a: string, b: string, t: number): string {
  const [x, y] = [channels(a), channels(b)]
  return `#${x.map((c, i) => Math.round(c * t + y[i] * (1 - t)).toString(16).padStart(2, '0')).join('')}`
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** {@return the WCAG contrast ratio of two colours} */
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('quest type symbols', () => {
  it('every type has a symbol of its own, not its category\'s fallback', () => {
    expect(TYPES.length).toBeGreaterThan(230)
    for (const { id, category } of TYPES) {
      const symbol = typeSymbol(category, id)
      expect(symbol.known, `${category} ${id}`).toBe(true)
      expect(symbol.grid, `${category} ${id}`).toHaveLength(12)
      expect(symbol.grid, `${category} ${id} draws the fallback`).not.toEqual(typeSymbol(category, '-').grid)
    }
  })

  it('no two types of a category look the same, colours included', () => {
    for (const category of CATEGORIES) {
      const fallback = typeSymbol(category, '-')
      const seen = new Map([[[...fallback.grid, fallback.main, fallback.accent].join('\n'), 'the fallback']])
      for (const { id } of TYPES.filter((t) => t.category === category)) {
        const { grid, main, accent } = typeSymbol(category, id)
        const look = [...grid, main, accent].join('\n')
        expect(seen.get(look), `${category} ${id} looks like ${seen.get(look)}`).toBeUndefined()
        seen.set(look, id)
      }
    }
  })

  it('a type the website does not know gets its category\'s fallback', () => {
    expect(TYPE_FALLBACKS).toEqual({ objective: 'target', requirement: 'search', reward: 'chest' })
    expect(typeSymbol('objective', 'brand_new_objective')).toMatchObject({ name: 'target', known: false })
    expect(typeSymbol('requirement', 'brand_new_requirement')).toMatchObject({ name: 'search', known: false })
    expect(typeSymbol('reward', 'brand_new_reward')).toMatchObject({ name: 'chest', known: false })
    // The same id is a different type in another category
    expect(typeSymbol('reward', 'coins').name).toBe('coin')
    expect(typeSymbol('objective', 'coins').known).toBe(false)
  })

  it('every symbol is 12 by 12 in the allowed characters', () => {
    for (const [name, grid] of Object.entries(SYMBOLS)) {
      expect(grid, name).toHaveLength(12)
      for (const row of grid) expect(row, name).toMatch(/^[.#+o]{12}$/)
    }
  })

  it('symbols are coloured by meaning', () => {
    expect(typeSymbol('reward', 'coins').main).toBe(TYPE_PALETTE.gold)
    expect(typeSymbol('objective', 'kill_mob').main).toBe(TYPE_PALETTE.steel)
    expect(typeSymbol('requirement', 'health').main).toBe(TYPE_PALETTE.red)
    // A badge says one thing in one hue: more is green, less is red
    expect(typeSymbol('objective', 'earn_coins')).toMatchObject({ main: TYPE_PALETTE.gold, accent: TYPE_PALETTE.green })
    expect(typeSymbol('reward', 'take_coins')).toMatchObject({ main: TYPE_PALETTE.gold, accent: TYPE_PALETTE.red })
  })

  it('each symbol uses only palette colours, and at most three: main, main dimmed and one accent', () => {
    const palette = Object.keys(TYPE_PALETTE)
    expect(palette.length).toBeGreaterThanOrEqual(8)
    expect(palette.length).toBeLessThanOrEqual(10)
    for (const [name, grid] of Object.entries(SYMBOLS)) {
      const { main, accent } = HUES[name]
      expect(palette, `${name} main`).toContain(main)
      expect(palette, `${name} accent`).toContain(accent)
      expect(accent, `${name}: an accent in its main hue would vanish`).not.toBe(main)
      const pixels = new Set(grid.join('').replaceAll('.', ''))
      const fills = new Set([...pixels].map((c) => (c === '#' ? main : c === '+' ? `${main} dimmed` : accent)))
      expect(fills.size, name).toBeLessThanOrEqual(3)
    }
  })

  it('every palette colour reads on every category\'s tile, dimmed ones too', () => {
    for (const [hue, hex] of Object.entries(TYPE_PALETTE)) {
      for (const tile of TILES) {
        expect(contrast(hex, tile), `${hue} on ${tile}`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(mix(hex, tile, 0.55), tile), `${hue} dimmed on ${tile}`).toBeGreaterThanOrEqual(2.5)
      }
    }
  })

  it('the category shows on the tile, in its own colour', () => {
    for (const category of CATEGORIES) {
      const tint = categoryTint(category)
      expect(tint.borderColor).toContain(`var(--color-type-${category})`)
      expect(tint.backgroundColor).toContain(`var(--color-type-${category})`)
    }
  })
})

describe('showcase icons', () => {
  const HUE_NAMES = iconHueNames as Record<string, { main: string; accent: string }>

  it('are painted by meaning in palette colours, two hues each', () => {
    for (const [name, { main, accent }] of Object.entries(HUE_NAMES)) {
      expect(hasIcon(name), name).toBe(true)
      expect(Object.keys(TYPE_PALETTE), `${name} main`).toContain(main)
      expect(Object.keys(TYPE_PALETTE), `${name} accent`).toContain(accent)
      expect(accent, name).not.toBe(main)
      expect(iconHues(name)).toEqual({ main: TYPE_PALETTE[main], accent: TYPE_PALETTE[accent] })
    }
    expect(iconHues('no_such_icon')).toBeUndefined()
  })

  it('every icon the showcase draws has its hues (the logo is its own component)', () => {
    const sources = ['src/pages/HomePage.vue', 'src/showcase/ShowcaseSection.vue', 'src/showcase/capabilities.ts']
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
    const names = new Set<string>()
    for (const m of sources.matchAll(/<(?:PixelIcon|ShowcaseSection)[^>]*?[\s](?:name|icon)="([a-z_]+)"|\bicon: '([a-z_]+)'/g)) names.add(m[1] ?? m[2]!)
    for (const m of sources.match(/STEP_ICONS = \[([^\]]*)\]/)?.[1]?.matchAll(/'([a-z_]+)'/g) ?? []) names.add(m[1]!)
    expect(names.size).toBeGreaterThan(10)
    for (const name of names) expect(iconHues(name), name).toBeDefined()
  })
})
