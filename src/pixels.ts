/**
 * Chronos's pixel art (src/data/icons.json, Tyche's format): the icons of the site and the creator, the hourglass logo
 * and an icon per item family. Every grid is original art: no game textures. scripts/make_icons.py checks the grids
 * and writes the favicon and app icons from the logo.
 */
import icons from './data/icons.json'
import itemIcons from './data/item-icons.json'
import iconHueNames from './data/icon-hues.json'
import typeIcons from './data/type-icons.json'

export type Grid = string[]
const GRIDS = icons as Record<string, Grid>

/** {@return a grid by name, or an empty one} */
export function grid(name: string): Grid {
  return GRIDS[name] ?? []
}

export function hasIcon(name: string): boolean {
  return name in GRIDS
}

/** The showcase's icons by meaning (src/data/icon-hues.json): a main hue and an accent, from the type symbols' palette. */
const ICON_HUES = iconHueNames as Record<string, { main: string; accent: string }>
const PALETTE = typeIcons.palette as Record<string, string>

/** {@return an icon's flat colours by meaning, or undefined for one without hues} */
export function iconHues(name: string): { main: string; accent: string } | undefined {
  const hues = ICON_HUES[name]
  const main = PALETTE[hues?.main ?? '']
  const accent = PALETTE[hues?.accent ?? '']
  return main && accent ? { main, accent } : undefined
}

/** One rect per horizontal run of the same character: far fewer nodes than one per pixel. */
export interface Run {
  x: number
  y: number
  w: number
  c: string
}

export function runs(rows: Grid): Run[] {
  const out: Run[] = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const c = row[x]!
      let w = 1
      while (x + w < row.length && row[x + w] === c) w++
      if (c !== '.') out.push({ x, y, w, c })
      x += w
    }
  })
  return out
}

// =========================================================================
// ITEMS: a picture of its own (the materials of the quest type icons), else a family icon tinted by the material
// =========================================================================

/**
 * Pictures of their own (src/data/item-icons.json, written by scripts/item_icons/make_item_icons.py), by bare key:
 * every material the plugin's TypeIcons uses, so no two types of a category look the same. Original art.
 */
const ITEM_PICTURES = itemIcons.items as Record<string, { tint: string; grid: Grid }>

/** The accents of those pictures, by character, beside '#' / '+' (the tint), 'o' (wood) and 'k' (dark). */
export const ITEM_PALETTE = itemIcons.palette as Record<string, string>

/** {@return the picture of its own a vanilla item has, or undefined} */
export function itemPicture(key: string): { tint: string; grid: Grid } | undefined {
  const k = key.trim().toLowerCase()
  if (k.startsWith('#') || (k.includes(':') && !k.startsWith('minecraft:'))) return undefined
  return ITEM_PICTURES[bareKey(k)]
}

/** Item families, first match wins (on the key without its namespace or #). */
const FAMILIES: [RegExp, string][] = [
  [/(^|_)sword$/, 'item_sword'],
  [/(^|_)(pickaxe|axe|shovel|hoe|shears|fishing_rod|flint_and_steel|brush|mace|spyglass)$/, 'item_tool'],
  [/(^|_)(bow|crossbow|trident)$/, 'item_bow'],
  [/(helmet|chestplate|leggings|boots|elytra|shield|horse_armor|wolf_armor)$/, 'item_armor'],
  [/(potion|_bottle|^bottle|honey_bottle)$/, 'item_potion'],
  [/(^|_)(cod|salmon|tropical_fish|pufferfish)$/, 'item_fish'],
  [/(apple|bread|beef|porkchop|chicken|mutton|rabbit|carrot|potato|melon_slice|berries|cookie|cake|pie|stew|soup|beetroot|kelp|chorus_fruit)$/, 'item_food'],
  [/_spawn_egg$|(^|_)egg$/, 'item_egg'],
  [/(book|bookshelf)$/, 'item_book'],
  [/(^|_)(head|skull)$/, 'item_head'],
  [/(nether_star|firework_star|star)$/, 'item_star'],
  [/(ender_pearl|ender_eye|heart_of_the_sea|snowball|slime_ball|fire_charge|magma_cream|experience|xp|orb)$/, 'item_orb'],
  [/(coin|coins|sunflower)$/, 'item_coin'],
  [/^(redstone|glowstone_dust|gunpowder|sugar|blaze_powder|bone_meal|honeycomb|red_dye|.*_dye|dragon_breath)$/, 'item_orb'],
  [/_bucket$|^bucket$/, 'item_bucket'],
  [/(wheat|wheat_seeds|_seeds|sapling|flower|tulip|dandelion|poppy|sugar_cane|bamboo|cactus|vine|sweet_berries)$/, 'item_plant'],
  [/^clock$/, 'time'],
  [/compass$/, 'objective'],
  [/(map|paper|name_tag|_sign|^sign)$/, 'quest'],
  [/^bell$/, 'notice'],
  [/^lightning_rod$/, 'bolt'],
  [/^totem_of_undying$/, 'item_head'],
  [/^end_crystal$/, 'item_gem'],
  [/^firework_rocket$/, 'item_star'],
  [/(_bed|armor_stand|minecart|_bars|grindstone|brewing_stand|farmland|dirt_path|_path)$/, 'item_block'],
  // Blocks, and block tags (#minecraft:logs, #minecraft:diamond_ores)
  [/(ores?|_blocks?|logs?|woods?|planks|stones?|cobblestone|dirt|sand|gravel|wool|glass|bricks|slabs?|stairs|terracotta|concrete|deepslate|netherrack|obsidian|leaves|target|tnt|chests?|barrel|furnace|table|anvils?|beacon|spawner|lectern|composter|cauldron|hopper|ice|clay|moss|mud|blackstone|basalt)$/, 'item_block'],
  [/(^|_)(diamond|emerald|amethyst_shard|quartz|lapis_lazuli|prismarine_crystals|echo_shard|gem)$/, 'item_gem'],
  [/(ingot|nugget|netherite_scrap|^brick|_brick|scrap|raw_iron|raw_gold|raw_copper)$/, 'item_ingot'],
]

/** Material colours, first match wins; the rest get a colour of their own from the key. */
const TINTS: [RegExp, string][] = [
  [/netherite/, '#a89bb5'],
  [/diamond/, '#67e8f9'],
  [/emerald/, '#34d399'],
  [/(gold|golden)/, '#fbbf24'],
  [/(iron|chainmail)/, '#d1d5db'],
  [/copper/, '#f0956a'],
  [/amethyst/, '#c084fc'],
  [/lapis/, '#60a5fa'],
  [/redstone/, '#f87171'],
  [/(quartz|snow|bone|paper)/, '#f5f5f4'],
  [/coal/, '#a8a29e'],
  [/(stone|cobble|gravel|andesite|diorite|granite|deepslate)/, '#b4b9c2'],
  [/(wood|oak|spruce|birch|jungle|acacia|mangrove|cherry|bamboo|crimson|warped|planks|log|stick|bow|crossbow|book)/, '#d39b62'],
  [/(leather|rabbit_hide|bread|cookie)/, '#d9935a'],
  [/(ender|prismarine|echo)/, '#5eead4'],
  [/(apple|beef|porkchop|mutton|redstone|nether_wart)/, '#f87171'],
  [/(potion|water|fish|cod|salmon)/, '#7dd3fc'],
  [/(star|blaze|glowstone)/, '#fde68a'],
]

export interface ItemArt {
  /** The family icon (or the item's own picture's key), or null when nothing fits (the tile then shows the item's initials). */
  icon: string | null
  /** The main colour. */
  tint: string
  /** The item's own picture, when it has one (else the family icon's grid is drawn). */
  grid?: Grid
}

/** {@return the bare key: tyche:boss → boss, #minecraft:logs → logs} */
export function bareKey(key: string): string {
  const k = key.trim().toLowerCase().replace(/^#/, '')
  return k.includes(':') ? k.slice(k.indexOf(':') + 1) : k
}

export function itemArt(key: string | null | undefined): ItemArt {
  const raw = (key || 'minecraft:paper').trim().toLowerCase()
  const own = itemPicture(raw)
  if (own) return { icon: bareKey(raw), tint: own.tint, grid: own.grid }
  const k = bareKey(raw)
  const namespace = raw.replace(/^#/, '').includes(':') ? raw.replace(/^#/, '').split(':')[0]! : 'minecraft'
  // Another plugin's item (a Vulcan item): a gem in that plugin's colour, unless its name says more
  const family = FAMILIES.find(([re]) => re.test(k))?.[1] ?? (namespace !== 'minecraft' ? 'item_gem' : null)
  const tint = TINTS.find(([re]) => re.test(k))?.[1] ?? hueTint(raw)
  return { icon: family, tint }
}

function hueTint(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 65% 72%)`
}
