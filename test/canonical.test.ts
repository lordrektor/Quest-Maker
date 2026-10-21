import { describe, expect, it } from 'vitest'
import { canonicalQuest } from '../shared/quest/canonical'
import { formatDuration, parseDuration } from '../shared/quest/durations'
import { seedQuests } from './seed'

describe('durations', () => {
  it('read and write like the plugin', () => {
    expect(parseDuration('90m')).toBe(5400)
    expect(formatDuration(5400)).toBe('1h30m')
    expect(formatDuration(parseDuration('1d12h'))).toBe('1d12h')
    expect(parseDuration('2w')).toBe(14 * 86400)
    expect(parseDuration('0')).toBe(0)
    expect(formatDuration(0)).toBe('0')
    expect(() => parseDuration('5')).toThrow(/not a duration/)
    expect(() => parseDuration('')).toThrow(/not a duration/)
  })
})

describe('canonical quests', () => {
  const quests = seedQuests()

  it('the seed has quests to compare', () => {
    expect(quests.length).toBeGreaterThanOrEqual(11)
  })

  it.each(quests.map((q) => [q.id, q] as const))('%s comes out exactly as the plugin stored it', (_, q) => {
    const { body, problems } = canonicalQuest(q.body, q.id)
    expect(problems.filter((p) => p.error)).toEqual([])
    expect(JSON.stringify(body)).toBe(JSON.stringify(q.body))
  })

  it('keeps no_teleport only when true, after auto_start', () => {
    const on = canonicalQuest({ pool: 'daily', no_teleport: true, auto_start: true, objectives: { a: { type: 'fish' } } }, 'jail')
    expect(on.problems.filter((p) => p.error)).toEqual([])
    if (!on.body) throw new Error('no body')
    expect(Object.keys(on.body)).toEqual(['id', 'name', 'pool', 'auto_start', 'no_teleport', 'objectives'])
    expect(on.body.no_teleport).toBe(true)
    expect(JSON.stringify(canonicalQuest(on.body, 'jail').body)).toBe(JSON.stringify(on.body))
    const off = canonicalQuest({ pool: 'daily', no_teleport: false, objectives: { a: { type: 'fish' } } }, 'free')
    expect(off.body).not.toHaveProperty('no_teleport')
  })

  it('writes messy input the way the plugin does', () => {
    const { body, problems } = canonicalQuest({
      pool: 'daily', name: 'X', icon: 'minecraft:paper', repeatable: false, cooldown: '90m', auto_start: false,
      objectives: {
        a: { amount: 3.0, type: 'kill_mob', stage: 0, entities: ['minecraft:zombie', 5], filters: { worlds: ['world'], hand: { items: ['stone'] } } },
        b: { type: 'fish', stage: 2, ignored_null: null },
      },
      fail: { when: [{ type: 'die', stage: 1 }], result: 'drop' },
    }, 'messy')
    expect(body).toEqual({
      id: 'messy', name: 'X', pool: 'daily', cooldown: '1h30m',
      objectives: {
        a: { type: 'kill_mob', amount: 3, entities: ['minecraft:zombie', '5'], filters: { worlds: { mode: 'whitelist', values: ['world'] }, hand: ['stone'] } },
        b: { type: 'fish', amount: 1, stage: 2 },
      },
      fail: { when: [{ type: 'die', amount: 1 }] },
    })
    expect(JSON.stringify(Object.keys(body!))).toBe(JSON.stringify(['id', 'name', 'pool', 'cooldown', 'objectives', 'fail']))
    expect(problems).toContainEqual({ path: 'fail.when[0].stage', message: 'ignored: fail conditions count in every stage', error: false })
  })

  it('reads and writes fail actions like the plugin', () => {
    const { body, problems } = canonicalQuest({ pool: 'p', objectives: { a: { type: 'fish' } },
      fail: { actions: [{ type: 'start_quest', quest: 'retry' }], message: 'x' } }, 'q')
    expect(body!.fail).toEqual({ message: 'x', actions: [{ type: 'start_quest', quest: 'retry' }] })
    expect(problems).toContainEqual({ path: 'fail', message: 'no when or unless entries: the actions run only when a plugin fails the quest', error: false })
  })

  it('reads and writes objective and stage rewards like the plugin', () => {
    const { body, problems } = canonicalQuest({
      rewards: [{ type: 'message', text: 'quest done' }],
      stages: { 1: { rewards: [{ type: 'message', text: 'stage 1 done' }] }, 0: { rewards: [{ type: 'message', text: 'stage 0 done' }] } },
      pool: 'p',
      objectives: { kill: { rewards: [{ type: 'message', text: 'kill done' }], type: 'kill_mob', amount: 2 }, boss: { type: 'kill_mob', stage: 1 } },
    }, 'q')
    expect(problems).toEqual([])
    expect(Object.keys(body!)).toEqual(['id', 'name', 'pool', 'objectives', 'stages', 'rewards'])
    expect(body!.objectives).toEqual({ kill: { type: 'kill_mob', amount: 2, rewards: [{ type: 'message', text: 'kill done' }] },
      boss: { type: 'kill_mob', amount: 1, stage: 1 } })
    expect(JSON.stringify(body!.stages)).toBe(JSON.stringify({ 0: { rewards: [{ type: 'message', text: 'stage 0 done' }] },
      1: { rewards: [{ type: 'message', text: 'stage 1 done' }] } }))
  })

  it('reports bad stages, and drops rewards on a fail condition', () => {
    const { body, problems } = canonicalQuest({ pool: 'p', objectives: { a: { type: 'fish' } },
      stages: { two: { rewards: [] }, 3: 'oops', 4: { rewards: [{ type: 'message', text: 'hi' }], colour: 'red' }, 2000: { rewards: [] } },
      fail: { when: [{ type: 'die', rewards: [{ type: 'message', text: 'no' }] }] } }, 'q')
    const lines = problems.map((p) => `${p.error ? 'E' : 'W'} ${p.path}: ${p.message}`)
    expect(lines).toContain("E stages.two: 'two' is not a stage number")
    expect(lines).toContain('E stages.3: must be a mapping (rewards)')
    expect(lines).toContain('E stages.2000: must be between 0 and 1000')
    expect(lines).toContain('W stages.4.colour: unknown key, ignored')
    expect(lines).toContain('W fail.when[0].rewards: ignored: a fail condition gives no rewards (use fail.actions)')
    expect(body?.fail).toEqual({ when: [{ type: 'die', amount: 1 }] })
  })

  it('reports the structural errors the codec reports', () => {
    const errors = (tree: Record<string, unknown>, id = 'q') => canonicalQuest(tree, id).problems.filter((p) => p.error)
    expect(errors({ objectives: { a: { type: 'fish' } } })).toContainEqual({ path: 'pool', message: 'missing: every quest belongs to a pool', error: true })
    expect(errors({ pool: 'p' })).toContainEqual({ path: 'objectives', message: 'missing: a quest needs at least one objective', error: true })
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish', amount: '5' } } })).toContainEqual(
      { path: 'objectives.a.amount', message: 'must be a whole number', error: true })
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish', amount: 0 } } })[0]?.message).toBe('must be at least 1')
    expect(errors({ pool: 'p', objectives: { 'Bad-Id': { type: 'fish' } } })[0]?.path).toBe('objectives.Bad-Id')
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish', nested: { x: 1 } } } })[0]?.message).toBe('must be a value or a list, not a mapping')
    expect(errors({ pool: 'p', repeatable: 'yes', objectives: { a: { type: 'fish' } } })[0]).toEqual(
      { path: 'repeatable', message: 'must be true or false', error: true })
    expect(errors({ id: 'other', pool: 'p', objectives: { a: { type: 'fish' } } })[0]?.message).toBe("the file says 'other' but it is stored as 'q'")
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish' } }, fail: { result: 'cooldown', when: [{ type: 'die' }] } })[0]).toEqual(
      { path: 'fail.cooldown', message: 'missing: result cooldown needs a cooldown, e.g. 1h', error: true })
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish', filters: { y: { min: 9, max: 2 } } } } })[0]?.message).toBe('min is above max')
    expect(errors({ pool: 'p', objectives: { a: { type: 'fish' } }, notices: { complete: { firework: { type: 'square' } } } })[0]?.path)
      .toBe('notices.complete.firework.type')
  })
})
