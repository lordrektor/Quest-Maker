import { describe, expect, it } from 'vitest'
import type { ParamDto } from '../shared/creator'
import { CatalogView } from '../src/creator/catalog'
import { isLineList, parseInput, splitValues, typedId } from '../src/creator/input'
import { CATALOG } from './fixtures'

const param = (kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name: 'x', kind, required: false, default: null, min: null, description: '', ...extra })

describe('typed values, like the in-game editor', () => {
  it('reads numbers with separators and decimal commas', () => {
    expect(parseInput(param('INTEGER'), '1_000')).toEqual({ value: 1000 })
    expect(parseInput(param('INTEGER'), '1,000')).toEqual({ value: 1000 })
    expect(parseInput(param('INTEGER'), '1.5')).toEqual({ error: "'1.5' is not a whole number." })
    expect(parseInput(param('INTEGER', { min: 1 }), '0')).toEqual({ error: 'It must be at least 1.' })
    expect(parseInput(param('DECIMAL'), '0,5')).toEqual({ value: 0.5 })
    expect(parseInput(param('DECIMAL'), 'abc')).toEqual({ error: "'abc' is not a number." })
  })

  it('writes durations, choices and keys the way the plugin stores them', () => {
    expect(parseInput(param('DURATION'), '90m')).toEqual({ value: '1h30m' })
    expect('error' in parseInput(param('DURATION'), 'soon')).toBe(true)
    expect(parseInput(param('CHOICE', { choices: ['drop', 'cooldown'] }), 'Cooldown')).toEqual({ value: 'cooldown' })
    expect(parseInput(param('BOOLEAN'), 'yes')).toEqual({ value: true })
    expect(parseInput(param('ITEM'), 'Minecraft:Diamond')).toEqual({ value: 'minecraft:diamond' })
    expect(parseInput(param('ITEM', { only: 'vulcan' }), 'minecraft:diamond')).toEqual(
      { error: "only vulcan items work here (vulcan:<id>), not 'minecraft:diamond'" })
    expect(parseInput(param('TEXT'), '  <red>Hi, there  ')).toEqual({ value: '<red>Hi, there' })
  })

  it('suggests vanilla blocks for one block, without tags', () => {
    const view = new CatalogView({ ok: true, catalog: { ...CATALOG, vanilla: { ...CATALOG.vanilla!, blockTags: ['#minecraft:logs'] } }, syncedAt: {}, refs: {}, refLabels: {}, pools: [] })
    const values = (p: ParamDto) => view.suggestions(p).map((s) => s.value)
    expect(values(param('BLOCK'))).toEqual(['minecraft:stone'])
    expect(values(param('BLOCK', { pick: ['vanilla:blocks'] }))).toEqual(['minecraft:stone'])
    expect(values(param('BLOCK_LIST', { pick: ['vanilla:blocks'] }))).toEqual(['minecraft:stone', '#minecraft:logs'])
  })

  it('reads one block key like an item key', () => {
    expect(parseInput(param('BLOCK'), ' Minecraft:Stone ')).toEqual({ value: 'minecraft:stone' })
    expect(parseInput(param('BLOCK'), 'oak_log')).toEqual({ value: 'oak_log' })
    expect(parseInput(param('BLOCK', { only: 'minecraft' }), 'vulcan:anvil')).toEqual(
      { error: "only vanilla blocks work here (minecraft:<id>), not 'vulcan:anvil'" })
  })

  it('keeps commas in description lines, and splits other lists', () => {
    expect(isLineList(param('STRING_LIST', { name: 'description' }))).toBe(true)
    expect(isLineList(param('STRING_LIST', { name: 'lore' }))).toBe(true)
    expect(isLineList(param('STRING_LIST', { name: 'worlds' }))).toBe(false)
    expect(splitValues('Slay them, all\nThen rest', true)).toEqual(['Slay them, all', 'Then rest'])
    expect(splitValues('a, b\nc', false)).toEqual(['a', 'b', 'c'])
  })

  it('reads ids like the in-game editor', () => {
    expect(typedId('  Hydra Hunt ')).toBe('hydra_hunt')
    expect(typedId('Kill_Zombies')).toBe('kill_zombies')
  })
})
