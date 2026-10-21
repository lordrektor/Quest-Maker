/** A small catalog, shaped like what /chronos cl types sends. */
import type { Catalog, ParamDto, TypeDto } from '../shared/creator'

const param = (name: string, kind: ParamDto['kind'], extra: Partial<ParamDto> = {}): ParamDto =>
  ({ name, kind, required: false, default: null, min: null, description: name, ...extra })
const type = (id: string, params: ParamDto[], owner = 'Chronos'): TypeDto => ({ id, owner, description: id, icon: 'minecraft:target', params })

export const CATALOG: Catalog = {
  types: {
    chronos: 'test',
    owners: ['Chronos', 'Tyche'],
    objective: [
      type('kill_mob', [param('entities', 'ENTITY_LIST', { pick: ['list:chronos:mobs'] }),
        param('credit', 'CHOICE', { choices: ['killer', 'contributors'], default: 'killer' })]),
      type('fish', [param('items', 'ITEM_LIST', { pick: ['vanilla:items'] })]),
      type('custom', []),
      type('die', []),
      type('biome_visit', [param('biomes', 'STRING_LIST', { choices: ['desert', 'plains'] })]),
      type('kill_tyche_boss', [param('bosses', 'STRING_LIST', { pick: ['refs:tyche:bosses'] })], 'Tyche'),
      type('equip_item', [param('items', 'ITEM_LIST', { required: true, only: 'vulcan', pick: ['refs:vulcan:items'] })], 'Vulcan'),
    ],
    requirement: [
      type('quest_completed', [param('quest', 'QUEST', { required: true, pick: ['d1:quests'] })]),
      type('quest_failed', [param('quest', 'QUEST', { required: true, pick: ['d1:quests'] }), param('times', 'INTEGER', { min: 1, default: '1' })]),
      type('level', [param('min', 'INTEGER', { min: 0 }), param('max', 'INTEGER')]),
      type('permission', [param('node', 'STRING', { required: true })]),
    ],
    reward: [
      type('item', [param('item', 'ITEM', { required: true, pick: ['vanilla:items', 'refs:vulcan:items'] }),
        param('amount', 'INTEGER', { min: 1, default: '1' })]),
      type('start_quest', [param('quest', 'QUEST', { required: true })]),
      type('vulcan_item', [param('item', 'ITEM', { required: true, only: 'vulcan', pick: ['refs:vulcan:items'] })], 'Vulcan'),
      type('set_block', [param('block', 'BLOCK', { required: true, pick: ['vanilla:blocks'] }), param('x', 'INTEGER'), param('y', 'INTEGER'),
        param('z', 'INTEGER')]),
      type('potion_effect', [param('potion', 'STRING'), param('duration', 'DURATION'), param('ambient', 'BOOLEAN'),
        param('strength', 'DECIMAL', { min: 0.5 })]),
    ],
    keySources: { 'item:vulcan': 'refs:vulcan:items', 'entity:tyche': 'refs:tyche:mobs' },
  },
  server: { name: 'lobby', minecraft: '1.21.11', difficulties: ['easy', 'medium', 'hard'], notices: {} },
  vanilla: {
    items: ['minecraft:diamond', 'minecraft:cod', 'minecraft:paper', 'minecraft:iron_sword'],
    blocks: ['minecraft:stone'],
    entities: ['minecraft:zombie', 'minecraft:blaze'],
    itemTags: ['#minecraft:logs'],
    blockTags: [],
    entityTags: ['#minecraft:undead'],
  },
}
