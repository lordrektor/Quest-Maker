import { describe, expect, it } from 'vitest'
import typeIcons from './fixtures/type-icons.json'
import itemIcons from '../src/data/item-icons.json'
import { hasIcon, ITEM_PALETTE, itemArt } from '../src/pixels'

/** The plugin's TypeIcons: each type id, its category and its icon material (test/fixtures/type-icons.json). */
const TYPES = typeIcons as { id: string; category: 'objective' | 'requirement' | 'reward'; material: string }[]

describe('quest type icons', () => {
  it('every material the types use has a picture of its own: no family, no initials', () => {
    const materials = [...new Set(TYPES.map((t) => t.material))]
    expect(materials.length).toBeGreaterThan(150)
    for (const material of materials) {
      const art = itemArt(material)
      expect(art.grid, material).toBeDefined()
      expect(art.icon, material).toBe(material.slice('minecraft:'.length))
      expect(hasIcon(art.icon!), `${material} is drawn as a family icon`).toBe(false)
    }
  })

  it('no two types of a category draw the same picture (grid and tint)', () => {
    for (const category of ['objective', 'requirement', 'reward'] as const) {
      const seen = new Map<string, string>()
      for (const type of TYPES.filter((t) => t.category === category)) {
        const art = itemArt(type.material)
        const picture = JSON.stringify([art.tint, art.grid])
        expect(seen.get(picture), `${category} ${type.id} looks like ${seen.get(picture)}`).toBeUndefined()
        seen.set(picture, type.id)
      }
    }
  })

  it('every picture is 12 by 12 and uses known colours only', () => {
    for (const [name, picture] of Object.entries(itemIcons.items)) {
      expect(picture.grid, name).toHaveLength(12)
      for (const row of picture.grid) {
        expect(row, name).toHaveLength(12)
        for (const c of row) expect('.#+ok'.includes(c) || c in ITEM_PALETTE, `${name} uses ${c}`).toBe(true)
      }
    }
  })

  it('other items keep their family and tint, unknown ones their initials; another plugin\'s key never takes a vanilla picture', () => {
    expect(itemArt('minecraft:diamond_sword')).toEqual({ icon: 'item_sword', tint: '#67e8f9' })
    expect(itemArt('#minecraft:logs').icon).toBe('item_block')
    expect(itemArt('minecraft:strange_thing').icon).toBeNull()
    expect(itemArt('vulcan:diamond').grid).toBeUndefined()
    expect(itemArt('chest').grid).toBe(itemIcons.items.chest.grid)
  })
})
