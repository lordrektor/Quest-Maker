import { describe, expect, it } from 'vitest'
import icons from '../src/data/icons.json'
import { bareKey, grid, itemArt, runs } from '../src/pixels'

describe('pixel art', () => {
  it('every icon is a square grid of known characters', () => {
    for (const [name, rows] of Object.entries(icons as Record<string, string[]>)) {
      expect(rows.length, name).toBeGreaterThan(0)
      for (const row of rows) {
        expect(row.length, name).toBe(rows.length)
        expect(row, name).toMatch(/^[#+okse=.]+$/)
      }
    }
  })

  it('draws one rect per run of the same colour', () => {
    expect(runs(['##..#+', '......'])).toEqual([{ x: 0, y: 0, w: 2, c: '#' }, { x: 4, y: 0, w: 1, c: '#' }, { x: 5, y: 0, w: 1, c: '+' }])
    expect(grid('nope')).toEqual([])
  })

  it('every icon the site names exists', () => {
    const named = ['logo', 'objective', 'requirement', 'reward', 'start', 'stage', 'finish', 'fail', 'notice', 'pool', 'link',
      'quest', 'workspace', 'plug', 'key', 'download', 'plus', 'undo', 'redo', 'tidy', 'save', 'warning', 'eye', 'star']
    for (const n of named) expect(grid(n).length, n).toBeGreaterThan(0)
  })

  // Items without a picture of their own (the type icon materials have one, see item-icons.test.ts)
  it('picks an item family and a material colour', () => {
    expect(itemArt('minecraft:diamond_sword')).toEqual({ icon: 'item_sword', tint: '#67e8f9' })
    expect(itemArt('minecraft:diamond_pickaxe').icon).toBe('item_tool')
    expect(itemArt('minecraft:apple')).toEqual({ icon: 'item_food', tint: '#f87171' })
    expect(itemArt('minecraft:diamond_ore').icon).toBe('item_block')
    expect(itemArt('minecraft:prismarine_crystals').icon).toBe('item_gem')
    expect(itemArt('#minecraft:logs').icon).toBe('item_block')
    expect(itemArt('minecraft:golden_chestplate')).toEqual({ icon: 'item_armor', tint: '#fbbf24' })
    expect(itemArt('minecraft:zombie_spawn_egg').icon).toBe('item_egg')
    expect(itemArt('vulcan:ember_blade').icon).toBe('item_gem')
    expect(itemArt('minecraft:gunpowder').icon).toBe('item_orb')
    expect(itemArt('minecraft:redstone_block').icon).toBe('item_block')
    expect(itemArt('minecraft:birch_sign').icon).toBe('quest')
    expect(itemArt('minecraft:dried_kelp_block_thing').icon).toBeNull()
    expect(bareKey('#tyche:Boss')).toBe('boss')
  })
})
