import { describe, expect, it } from 'vitest'
import { describeRequirement, describeReward } from '../src/describe'
import { plainText } from '../src/minimessage'
import { COUNTS, INTEGRATIONS } from '../src/showcase/capabilities'
import { type TypeCategory, typeSymbol } from '../src/typeIcons'
import typeIds from './fixtures/type-ids.json'

const ids = typeIds as { id: string; category: TypeCategory }[]
const line = (l: { mini: string; placeholders?: Record<string, string> } | null) => (l ? plainText(l.mini, { placeholders: l.placeholders }) : null)
const GEM_TYPES: { id: string; category: TypeCategory }[] = [
  { id: 'has_vulcan_gem', category: 'requirement' },
  { id: 'has_socketed_gem', category: 'requirement' },
  { id: 'vulcan_gem', category: 'reward' },
]

describe('Vulcan gems (Chronos 1.4.0)', () => {
  it('has_vulcan_gem reads the gems carried, together, or any gem', () => {
    expect(line(describeRequirement({ type: 'has_vulcan_gem', gems: ['ruby', 'onyx'], amount: 3 }))).toBe('Have 3 ruby or onyx')
    expect(line(describeRequirement({ type: 'has_vulcan_gem' }))).toBe('Have 1 Vulcan gem')
    expect(line(describeRequirement({ type: 'has_vulcan_gem', amount: 4 }))).toBe('Have 4 Vulcan gems')
    expect(line(describeRequirement({ type: 'has_vulcan_gem', gems: ['ruby'], not: true }))).toBe('Not: Have 1 ruby')
  })

  it('has_socketed_gem reads the gems and the gear they are in', () => {
    expect(line(describeRequirement({ type: 'has_socketed_gem', gems: ['ruby'], items: ['vulcan:ember_blade'], amount: 2 })))
      .toBe('2 ruby socketed in ember blade')
    expect(line(describeRequirement({ type: 'has_socketed_gem' }))).toBe('1 Vulcan gem socketed in worn gear')
    expect(line(describeRequirement({ type: 'has_socketed_gem', amount: 3, items: ['vulcan:ember_blade', 'vulcan:frost_helm'] })))
      .toBe('3 Vulcan gems socketed in ember blade or frost helm')
  })

  it('vulcan_gem reads as the gems given', () => {
    expect(line(describeReward({ type: 'vulcan_gem', gem: 'onyx', amount: 3 }))).toBe('3× onyx')
    expect(line(describeReward({ type: 'vulcan_gem', gem: 'blood_ruby' }))).toBe('1× blood ruby')
    expect(line(describeReward({ type: 'vulcan_gem' }))).toBe('1× Vulcan gem')
  })

  it('each has a symbol of its own, unlike any other type of its category', () => {
    const look = (s: ReturnType<typeof typeSymbol>) => [...s.grid, s.main, s.accent].join('\n')
    for (const { id, category } of GEM_TYPES) {
      expect(ids, id).toContainEqual({ id, category })
      const symbol = typeSymbol(category, id)
      expect(symbol.known, id).toBe(true)
      expect(symbol.name.startsWith('gem'), `${id} is a gem`).toBe(true)
      expect(ids.filter((t) => t.category === category && t.id !== id && look(typeSymbol(category, t.id)) === look(symbol)), id).toEqual([])
    }
  })

  it('shows on the Vulcan card, and the counts still cover every type', () => {
    const vulcan = INTEGRATIONS.find((i) => i.name === 'Vulcan')!
    expect(vulcan.requirements).toEqual(expect.arrayContaining(['has_vulcan_gem', 'has_socketed_gem']))
    expect(vulcan.rewards).toContain('vulcan_gem')
    const count = (category: string) => ids.filter((t) => t.category === category).length
    expect(COUNTS).toMatchObject({ objectives: count('objective'), requirements: count('requirement'), rewards: count('reward') })
  })
})
