/**
 * The example quest of the showcase: hydras_bane from scripts/seed-local.sql, bundled so the home page needs no
 * server data. It uses Tyche, Chrysos, Vulcan and ExperienceTailor types, stages, a fail block and a quest chain.
 */
import type { Tree } from '../describe'

export const EXAMPLE_QUEST: Tree = {
  id: 'hydras_bane',
  name: '<gradient:#3a2a24:#ff7a1c>The Cinder Hydra</gradient>',
  description: [
    '<gray>Something burns beneath the <gold>Ashen Peaks</gold>.',
    '<gray>Bring friends. <italic>Lots</italic> of friends.',
  ],
  icon: 'minecraft:dragon_head',
  difficulty: 'hard',
  pool: 'boss_hunts',
  repeatable: true,
  cooldown: '3d',
  time_limit: '1h',
  requirements: [
    { type: 'quest_completed', quest: 'hunters_vow' },
    { type: 'level', min: 20 },
    { type: 'tyche_boss_kills', boss: 'cinder_hydra', compare: '<', value: 10 },
    { type: 'has_vulcan_item', item: 'vulcan:ember_blade' },
  ],
  objectives: {
    whelps: { type: 'kill_tyche_mob', amount: 15, mobs: ['ember_whelp'], summoned_by: ['cinder_hydra'] },
    heads: {
      type: 'damage_tyche',
      amount: 20,
      bosses: ['cinder_hydra'],
      parts: ['b_head_left', 'b_head_right'],
      count: 'hits',
    },
    slay: {
      type: 'kill_tyche_boss',
      amount: 1,
      stage: 1,
      bosses: ['cinder_hydra'],
      credit: 'contributors',
      min_share: 10,
      max_fight: '5m',
    },
  },
  rewards: [
    { type: 'coins', amount: 500 },
    { type: 'coins', amount: 5, currency: 'gems', reason: "Hydra's hoard" },
    { type: 'tyche_loot', table: 'hydra_hoard', rolls: 2 },
    { type: 'vulcan_item', item: 'vulcan:ember_crown', quality: 'random' },
    { type: 'experience', amount: 250 },
    { type: 'broadcast', text: '<gold><player> <yellow>slew the Cinder Hydra!' },
    {
      type: 'command',
      run: 'lp user <player> parent add hydra_slayer',
      display: '<gold>The <red>Hydra Slayer</red> title',
    },
  ],
  messages: { start: '<prefix><red>The peaks tremble.' },
  fail: {
    when: [
      {
        type: 'killed_by_tyche',
        display: '<red>Burn in its flame breath',
        amount: 1,
        bosses: ['cinder_hydra'],
        attacks: ['flame_breath'],
      },
      { type: 'damaged_by_tyche', amount: 3, summoned_by: ['cinder_hydra'], count: 'hits' },
    ],
    unless: [{ type: 'in_world', worlds: ['world'] }, { type: 'health', compare: '>', value: 4 }],
    result: 'cooldown',
    cooldown: '1h',
    message: '<red>The hydra sends you home. Try again in an hour.',
  },
}
