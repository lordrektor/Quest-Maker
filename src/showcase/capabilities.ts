/**
 * What the public home page shows about Chronos. Everything here is written by hand (or comes from describe.ts and
 * the bundled example quest); the home page reads no server data.
 *
 * The sample trees use real type ids and arguments (docs/types.md, docs/integrations.md), and the page turns them into
 * lines with describe.ts, the same sentences the creator shows on its nodes.
 */
import type { Tree } from '../describe'

/** Rounded counts of the plugin's catalog (TypeSpecs registered with every integration installed). */
export const COUNTS = { objectives: 123, requirements: 58, rewards: 63, integrations: 12 } as const

/**
 * A quest of two stages: the first runs its objectives in parallel, the second unlocks once both are done. One
 * objective and the first stage pay out on their own, before the quest's rewards at the end.
 */
export const STAGE_SAMPLE: Tree = {
  objectives: {
    chop: { type: 'block_break', amount: 32, blocks: ['#minecraft:logs'] },
    hunt: {
      type: 'kill_mob', amount: 10, entities: ['minecraft:zombie', 'minecraft:husk'], filters: { y: { max: 40 } },
      rewards: [{ type: 'vanilla_experience', amount: 50 }],
    },
    forge: { type: 'craft', amount: 1, stage: 1, items: ['minecraft:iron_axe'] },
    deliver: { type: 'deliver', amount: 16, stage: 1, items: ['minecraft:iron_ingot'] },
  },
  stages: { 0: { rewards: [{ type: 'item', item: 'minecraft:iron_ingot', amount: 4 }] } },
}

/** Families of objective types, with ids from describe.ts's OBJECTIVES to sample. */
export const OBJECTIVE_FAMILIES: { name: string; types: string[] }[] = [
  { name: 'Gathering and building', types: ['block_break', 'block_place', 'collect', 'harvest', 'strip', 'fill_bucket'] },
  { name: 'Combat', types: ['kill_mob', 'kill_player', 'shoot', 'deal_vanilla_damage', 'use_totem', 'death'] },
  { name: 'Crafting and stations', types: ['craft', 'smelt', 'brew', 'enchant', 'smith', 'anvil', 'trade'] },
  { name: 'Animals', types: ['breed', 'tame', 'shear', 'milk', 'bucket_mob', 'cure_villager'] },
  { name: 'Exploration', types: ['reach_location', 'travel_distance', 'enter_biome', 'find_structure', 'change_world', 'open_loot_chest'] },
  { name: 'Progress and play', types: ['advancement', 'reach_vanilla_level', 'win_raid', 'playtime', 'chat', 'run_command'] },
]

/**
 * Requirements as a quest lists them: plain ones, a reversed one (Must not), a group that needs any one of its
 * requirements, and requirements that read a place (mobs around the player, a chest at a spot).
 */
export const REQUIREMENT_SAMPLES: Tree[] = [
  { type: 'quest_completed', quest: 'first_steps' },
  { type: 'quest_completed', quest: 'the_finale', not: true },
  { type: 'vanilla_level', compare: '>=', value: 15 },
  {
    any: [{ type: 'permission', node: 'ranks.hunter' }, { type: 'pool_level', quest_pool: 'daily', compare: '>=', value: 3 }],
  },
  { type: 'in_dimension', dimensions: ['nether'] },
  { type: 'real_time', days: ['SATURDAY', 'SUNDAY'] },
  { type: 'has_item', items: ['minecraft:diamond'], amount: 5 },
  { type: 'entities_nearby', entities: ['minecraft:villager'], value: 3 },
  { type: 'container_has_item', world: 'world', x: 10, y: 64, z: -5, items: ['minecraft:bread'], amount: 16 },
]

export const REWARD_SAMPLES: Tree[] = [
  { type: 'item', item: 'minecraft:diamond', amount: 3 },
  { type: 'vanilla_experience', amount: 250 },
  { type: 'potion_effect', potion: 'minecraft:speed', level: 2, duration: '5m' },
  { type: 'start_quest', quest: 'into_the_mines' },
  { type: 'command', run: 'lp user <player> parent add explorer', display: '<aqua>The Explorer rank' },
  { type: 'teleport', world: 'world_nether' },
]

/** Rewards that only make noise: they run without a line in the quest list. */
export const SILENT_REWARD_TYPES = ['message', 'broadcast', 'title', 'sound', 'firework', 'command', 'set_time', 'set_weather', 'lightning'] as const

export const FAIL_SAMPLE: Tree = {
  when: [{ type: 'death', amount: 1 }, { type: 'change_world', amount: 1, dimensions: ['the_end'] }],  unless: [{ type: 'in_dimension', dimensions: ['nether'] }],
  result: 'cooldown',
  cooldown: '1h',
  actions: [
    { type: 'start_quest', quest: 'ashes_and_embers' },
    { type: 'message', text: "<red>The hydra's flames were too much." },
  ],
}

/** Callbacks of a boss hunt: what happens to the world as the run goes on (never listed to players). */
export const CALLBACK_SAMPLE: { when: string; actions: Tree[] }[] = [
  { when: 'On start', actions: [{ type: 'set_time', time: 'night' }, { type: 'set_weather', weather: 'thunder', duration: '10m' }] },
  { when: 'When the whelps are slain', actions: [{ type: 'summon_tyche_boss', boss: 'cinder_hydra', world: 'world', x: 120, y: 64, z: -40 }] },
  { when: 'On completion', actions: [{ type: 'reputation', reputation: 'town_morale', amount: 5 }, { type: 'broadcast', text: '<gold><player> slew the hydra' }] },
  { when: 'On failure', actions: [{ type: 'set_time', time: 'day' }, { type: 'set_weather', weather: 'clear' }] },
]

/** The bundled config.yml notices: what a player sees and hears on each quest event. */
export const NOTICES: { event: string; title: string; subtitle: string; sound: string; particles: string; firework: string | null }[] = [
  {
    event: 'Start',
    title: '<green>Quest started',
    subtitle: '<white><quest>',
    sound: 'item.book.page_turn',
    particles: 'enchant ×40',
    firework: null,
  },
  {
    event: 'Complete',
    title: '<gold>Quest complete!',
    subtitle: '<white><quest>',
    sound: 'entity.player.levelup',
    particles: 'happy_villager ×30',
    firework: 'large ball, gold and white, fading to orange',
  },
  {
    event: 'Fail',
    title: '<red>Quest failed',
    subtitle: '<gray><quest>',
    sound: 'entity.villager.no',
    particles: 'smoke ×25',
    firework: null,
  },
]

/** Sample pools, as in scripts/seed-local.sql. */
export const POOL_SAMPLES: { id: string; kind: 'story' | 'rotating'; icon: string; body: Tree; blurb: string }[] = [
  {
    id: 'global',
    kind: 'story',
    icon: 'minecraft:book',
    body: { id: 'global', type: 'global', name: '<aqua>Story' },
    blurb: 'Every quest is listed all the time. Each can be done once, or again after a cooldown when repeatable.',
  },
  {
    id: 'daily',
    kind: 'rotating',
    icon: 'minecraft:clock',
    body: {
      id: 'daily',
      type: 'timed_random',
      name: '<yellow>Daily Quests',
      reset: '0 0 0 * * ?',
      roll: { easy: 1, medium: 1, hard: 1 },
      levels: {
        thresholds: [5, 15, 30],
        rewards: { default: [{ type: 'vanilla_experience', amount: 50 }], 3: [{ type: 'item', item: 'minecraft:diamond', amount: 3 }] },
      },
    },
    blurb: 'Each player (or each character) rolls fresh quests per difficulty; unfinished ones drop at the next reset.',
  },
  {
    id: 'boss_hunts',
    kind: 'rotating',
    icon: 'minecraft:dragon_head',
    body: {
      id: 'boss_hunts',
      type: 'timed_random',
      name: '<gradient:#ff7a1c:#ffd36e>Boss Hunts</gradient>',
      reset: '0 0 18 ? * FRI',
      timezone: 'Europe/Berlin',
      roll: { hard: 1 },
      shared_rolls: true,
    },
    blurb: 'With shared rolls the whole network gets the same hunt, so players can team up for it.',
  },
]

/** How one quest leads to the next, as the creator draws the lines between quests. */
export type ChainLink = 'starts' | 'requires' | 'fail-starts' | 'fail-unlocks'

export const CHAIN_LINKS: Record<ChainLink, { label: string; line: string; text: string; legend: string }> = {
  starts: { label: 'starts', line: 'border-gold-400', text: 'text-gold-300', legend: 'a start_quest reward of the earlier quest' },
  requires: { label: 'requires', line: 'border-dashed border-emerald-400', text: 'text-emerald-300', legend: 'a quest_completed requirement of the later one' },
  'fail-starts': { label: 'on fail starts', line: 'border-red-400', text: 'text-red-300', legend: 'a start_quest in the fail actions of the earlier quest' },
  'fail-unlocks': { label: 'on fail unlocks', line: 'border-dashed border-red-300', text: 'text-red-300', legend: 'a quest_failed requirement of the later one' },
}

/**
 * A chain of quests from the seed, through the example quest to what follows when it is lost. `link` joins a quest
 * to the one before it.
 */
export const CHAIN: { id: string; name: string; icon: string; link?: ChainLink }[] = [
  { id: 'smiths_favour', name: "<#c9d1d9>The Smith's <bold>Favour", icon: 'minecraft:anvil' },
  { id: 'hunters_vow', name: "<red>Hunter's Vow", icon: 'minecraft:iron_sword', link: 'starts' },
  { id: 'hydras_bane', name: '<gradient:#3a2a24:#ff7a1c>The Cinder Hydra</gradient>', icon: 'minecraft:dragon_head', link: 'requires' },
  { id: 'ashes_and_embers', name: '<gray>Ashes and Embers', icon: 'minecraft:blaze_powder', link: 'fail-starts' },
]

export interface Integration {
  name: string
  /** What the plugin is, in a few words. */
  what: string
  text: string
  objectives: string[]
  requirements: string[]
  rewards: string[]
}

export const INTEGRATIONS: Integration[] = [
  {
    name: 'Tyche',
    what: 'bosses, custom mobs and NPCs',
    text: 'Boss fights as objectives: who gets credit, which parts were hit, which phase was reached, and fail rules for its attacks. NPCs too: click or hit them, hunt them, keep an escort alive, turn them hostile or have them wait.',
    objectives: ['kill_tyche_boss', 'kill_tyche_mob', 'damage_tyche', 'reach_boss_phase', 'killed_by_tyche', 'tyche_loot', 'interact_tyche_npc', 'kill_tyche_npc',
      'tyche_npc_dies'],
    requirements: ['tyche_boss_kills', 'tyche_mob_kills', 'tyche_mobs_nearby', 'tyche_bosses_nearby', 'near_tyche_npc', 'tyche_npc_alive', 'tyche_npc_in_combat'],
    rewards: ['tyche_loot', 'summon_tyche_boss', 'summon_tyche_mob', 'set_npc_hostility', 'teleport_to_npc', 'hold_tyche_npc'],
  },
  {
    name: 'Vulcan',
    what: 'custom items and gear',
    text: 'Quests about gear: equip, reforge, socket gems and activate set bonuses, and hand out Vulcan items with a quality.',
    objectives: ['equip_item', 'activate_set', 'reforge_item', 'socket_gem', 'fuse_item', 'repair_item'],
    requirements: ['has_vulcan_item', 'container_has_vulcan_item'],
    rewards: ['vulcan_item', 'vulcan_items'],
  },
  {
    name: 'ExperienceTailor',
    what: 'levels, stats and expertise',
    text: 'Gate quests by level, stat or expertise, count levels gained and effects applied, pay out experience, and hide or show the HUD for a scene. With characters, each one has its own quests, unless a quest or pool is shared with scope: account.',
    objectives: ['reach_level', 'level_up', 'gain_experience', 'deal_damage', 'assign_expertise', 'gain_effect'],
    requirements: ['level', 'expertise', 'stat', 'have_effect'],
    rewards: ['experience', 'give_effect', 'restore_pool', 'set_hud'],
  },
  {
    name: 'Chrysos',
    what: 'currencies',
    text: 'Earn, spend and trade coins as objectives, require a balance, and pay rewards in any currency.',
    objectives: ['earn_coins', 'spend_coins', 'pay_player', 'receive_payment'],
    requirements: ['coins'],
    rewards: ['coins', 'take_coins'],
  },
  {
    name: 'Kleos',
    what: 'reputation',
    text: 'Earn standing with guilds and towns: gain or lose reputation, reach a value, require one to start, and pay reputation out as a reward, per character, per account (shared by all characters of a player) or for the whole server.',
    objectives: ['gain_reputation', 'lose_reputation', 'reach_reputation'],
    requirements: ['reputation'],
    rewards: ['reputation', 'set_reputation', 'reset_reputation'],
  },
  {
    name: 'Crius',
    what: 'titles',
    text: 'Hand out titles for good or for a while, put them on the player, require one to start, and count titles unlocked, worn or lost; a lost title can fail the quest.',
    objectives: ['unlock_title', 'wear_title', 'lose_title'],
    requirements: ['has_title', 'wearing_title'],
    rewards: ['give_title', 'take_title', 'equip_title'],
  },
  {
    name: 'Metabasis',
    what: 'warps and teleports',
    text: 'Send players to a warp or a world spawn, open and close warps, require access to one, count warps used, teleports and accepted requests, and keep a quest free of teleport shortcuts.',
    objectives: ['use_warp', 'use_teleport', 'accept_teleport_request'],
    requirements: ['can_use_warp'],
    rewards: ['warp', 'spawn', 'set_warp_enabled'],
  },
  {
    name: 'RpgInv',
    what: 'bags and accessories',
    text: 'Item quests see the RpgInv bags and loot pickup, rewards land in the Auto Loot Bag, and quests can ask for a bag tier, an accessory or auto loot, or count bag upgrades and accessories put on.',
    objectives: ['upgrade_bag', 'equip_accessory', 'unequip_accessory', 'toggle_auto_loot', 'use_rpg_button', 'open_rpg_menu'],
    requirements: ['bag_tier', 'wearing_accessory', 'auto_loot'],
    rewards: ['set_bag_tier'],
  },
  {
    name: 'Convo',
    what: 'NPC conversations',
    text: 'Quests that talk: count NPCs talked to, conversations started or finished and the answers players pick, and have an NPC start a conversation as a step of the quest.',
    objectives: ['talk_npc', 'convo_start', 'convo_finish', 'convo_answer'],
    requirements: [],
    rewards: ['start_convo'],
  },
  {
    name: 'Phantasos',
    what: 'cutscenes',
    text: 'Quests with a story told on screen: count cutscenes watched or skipped, require one seen or playing right now, and play, stop or mark a cutscene as watched as a step of the quest.',
    objectives: ['watch_cutscene', 'skip_cutscene'],
    requirements: ['seen_cutscene', 'watching_cutscene'],
    rewards: ['play_cutscene', 'stop_cutscene', 'mark_cutscene_seen'],
  },
  {
    name: 'Plutus',
    what: 'loot nodes',
    text: 'Loot chests and nodes as quests: count nodes looted, the items they drop and the loot groups that trigger, require pity for a rare group, and roll a node\'s loot as a reward. Plutus\'s own loot gates ask Chronos which quests a player has done.',
    objectives: ['plutus_loot', 'plutus_loot_item', 'plutus_group'],
    requirements: ['plutus_pity'],
    rewards: ['plutus_loot'],
  },
  {
    name: 'Hermes',
    what: 'parties',
    text: 'Quests for groups: create, join or lead a party, invite friends and take a role, require a party or members close by, credit kills to the whole party, and hand rewards to every party member nearby.',
    objectives: ['create_party', 'join_party', 'invite_to_party', 'leave_party', 'take_party_role', 'become_party_leader'],
    requirements: ['in_party', 'party_leader', 'party_role', 'party_balanced', 'party_members_near'],
    rewards: [],
  },
]

/** How a quest gets from the web creator onto the server. */
export const CREATOR_STEPS: { title: string; command?: string; text: string }[] = [
  {
    title: 'Get a code',
    command: '/chronos cl otp',
    text: 'In game, ask for a six-digit code. It works once, for a few minutes, and signs you in as yourself.',
  },
  {
    title: 'Open a workspace',
    text: 'Type a workspace name and lay out quests on one canvas: stages, objectives, rewards and the lines that chain quests together.',
  },
  {
    title: 'Pull it into the game',
    command: '/chronos cl download ws <workspace>',
    text: 'Saving writes to this site only. An admin pulls every quest of the workspace onto the server (or one with cl download quest <id>), where Chronos checks them before they go live.',
  },
]

/** What runs around the quests: menus, the editor, storage, networks and other plugins (docs/README.md). */
export const PLATFORM: { icon: string; title: string; text: string }[] = [
  {
    icon: 'quest',
    title: 'Player menus',
    text: '/quests opens chest menus: the pools, their quests with what each needs and gives, the objectives of every stage, and buttons to start, abandon or track.',
  },
  {
    icon: 'eye',
    title: 'Tracking',
    text: 'The quest a player follows shows in a boss bar or the action bar with its next objective and progress, updated every second.',
  },
  {
    icon: 'tidy',
    title: 'In-game editor',
    text: '/chronos editor edits every quest and pool field in chest menus with pickers for items, mobs, biomes and other plugins\' ids, moves requirements into groups and rewards between places, and checks each change as you make it.',
  },
  {
    icon: 'database',
    title: 'Four databases',
    text: 'SQLite, MySQL or MariaDB, PostgreSQL or Redis, with /chronos migrate to move everything from one to another.',
  },
  {
    icon: 'link',
    title: 'Several servers',
    text: 'Servers behind one proxy share progress, quests and pools: a player\'s quests follow them, and timed pools reset at the same moment everywhere.',
  },
  {
    icon: 'plug',
    title: 'API and placeholders',
    text: 'A Java API with events to start, cancel and change quests, progress and rewards, and PlaceholderAPI placeholders for scoreboards and holograms.',
  },
  {
    icon: 'download',
    title: 'YAML in and out',
    text: 'Import folders of quest and pool files and export them back clean. The bundled examples import on the first start.',
  },
  {
    icon: 'bolt',
    title: 'Folia ready',
    text: 'Objectives count on the player\'s own region thread; menus and rewards run there too. Built for Folia 1.21.11.',
  },
]
