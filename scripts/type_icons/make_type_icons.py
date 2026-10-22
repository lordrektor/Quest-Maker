"""Writes src/data/type-icons.json: a 12x12 symbol per quest type, by category and id, in the Tyche website's style.

Usage (from the project folder): python scripts/type_icons/make_type_icons.py [preview.html]

A symbol is a base (symbols_*.py) by meaning, or a base with a small badge in its corner that turns it into a verb (coin
and plus: earn coins; scroll and check: quest completed). Checks: every type of test/fixtures/type-ids.json has a
symbol; every grid is 12x12 with known characters; no two types of a category share a grid, nor the category's
fallback (for types the website does not know yet).
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from symbols_a import SYMBOLS as A  # noqa: E402
from symbols_b import SYMBOLS as B  # noqa: E402
from symbols_c import SYMBOLS as C  # noqa: E402

BASES = {**A, **B, **C}
ALLOWED = set('.#+o')

# Badges: 5x5 in the bottom-right corner, drawn in the accent on a cleared square
BADGES = {
    'plus': ["..o..", "..o..", "ooooo", "..o..", "..o.."],
    'minus': [".....", ".....", "ooooo", "ooooo", "....."],
    'up': ["..o..", ".ooo.", "ooooo", "..o..", "..o.."],
    'down': ["..o..", "..o..", "ooooo", ".ooo.", "..o.."],
    'right': ["..o..", "..oo.", "ooooo", "..oo.", "..o.."],
    'left': ["..o..", ".oo..", "ooooo", ".oo..", "..o.."],
    'check': ["....o", "...oo", "o.oo.", "ooo..", ".o..."],
    'cross': ["o...o", ".o.o.", "..o..", ".o.o.", "o...o"],
    'star': ["..o..", ".ooo.", "ooooo", ".ooo.", ".o.o."],
    'flag': ["oooo.", "o.ooo", "oooo.", "o....", "o...."],
    'dot': [".....", ".ooo.", ".ooo.", ".ooo.", "....."],
    'loop': [".ooo.", "o...o", "o....", "o..o.", ".oooo"],
    'bolt': ["...oo", "..oo.", ".ooo.", ".oo..", "oo..."],
    'drop': ["..o..", ".ooo.", "ooooo", "ooooo", ".ooo."],
    'pause': ["oo.oo", "oo.oo", "oo.oo", "oo.oo", "....."],
}

FALLBACKS = {'objective': 'target', 'requirement': 'search', 'reward': 'chest'}

# Flat colours by meaning, readable on the night tiles. A symbol paints '#' in its main hue, '+' in the same hue dimmed and
# 'o' in one accent: three colours at most. The category is the tile's border and tint, never the symbol's colour.
PALETTE = {
    'red': '#f87171', 'orange': '#fb923c', 'gold': '#facc15', 'green': '#4ade80', 'teal': '#2dd4bf',
    'blue': '#60a5fa', 'purple': '#c084fc', 'pink': '#f472b6', 'steel': '#cbd5e1', 'brown': '#d19a66',
}

# base -> (main, accent), by what it means: steel blades and tools, a red heart, a gold coin, a blue drop, green growth...
COLOURS = {
    # weapons, tools, armour: steel with a wooden handle
    'sword': ('steel', 'brown'), 'swords': ('steel', 'brown'), 'pickaxe': ('steel', 'brown'), 'axe': ('steel', 'brown'),
    'hoe': ('steel', 'brown'), 'hammer': ('steel', 'brown'), 'anvil': ('steel', 'brown'), 'shield': ('steel', 'brown'),
    'scissors': ('steel', 'red'), 'wrench': ('steel', 'orange'), 'grind': ('steel', 'orange'), 'crack': ('steel', 'red'),
    'armor': ('steel', 'gold'), 'bow': ('brown', 'steel'), 'hook': ('blue', 'steel'), 'dumbbell': ('steel', 'red'),
    # creatures and people
    'skull': ('steel', 'red'), 'boss': ('red', 'gold'), 'ghost': ('steel', 'blue'), 'tombstone': ('steel', 'green'),
    'heart': ('red', 'pink'), 'heart_broken': ('red', 'steel'), 'person': ('blue', 'gold'), 'people': ('blue', 'gold'),
    'npc': ('teal', 'gold'), 'crown': ('gold', 'red'), 'hand': ('orange', 'red'), 'paw': ('brown', 'pink'),
    'bone': ('steel', 'brown'), 'feet': ('brown', 'gold'), 'leap': ('green', 'gold'), 'egg': ('teal', 'gold'),
    # magic
    'wand': ('purple', 'gold'), 'staff': ('brown', 'purple'), 'totem': ('gold', 'green'), 'sparkle': ('purple', 'pink'),
    'dots': ('purple', 'gold'), 'potion': ('pink', 'brown'), 'portal': ('purple', 'pink'), 'swirl': ('purple', 'teal'),
    'orb': ('green', 'gold'), 'spark': ('green', 'gold'),
    # wealth
    'coin': ('gold', 'orange'), 'gem': ('teal', 'steel'), 'ore': ('steel', 'teal'), 'ring': ('gold', 'red'),
    'star': ('gold', 'orange'), 'trophy': ('gold', 'brown'), 'rank': ('gold', 'orange'), 'scales': ('gold', 'steel'),
    'trade': ('green', 'gold'), 'lock': ('gold', 'steel'),
    # nature and weather
    'flask': ('blue', 'steel'), 'bucket': ('steel', 'blue'), 'apple': ('red', 'green'), 'wheat': ('gold', 'green'),
    'sprout': ('green', 'brown'), 'tree': ('green', 'brown'), 'honeycomb': ('gold', 'orange'), 'compost': ('brown', 'green'),
    'sun': ('gold', 'orange'), 'cloud': ('steel', 'blue'), 'bolt': ('gold', 'orange'), 'flame': ('orange', 'gold'),
    'drop': ('blue', 'steel'), 'cube': ('green', 'brown'), 'globe': ('blue', 'green'),
    # words and signs
    'book': ('blue', 'gold'), 'scroll': ('gold', 'brown'), 'letter': ('steel', 'red'), 'speech': ('steel', 'blue'),
    'tag': ('orange', 'steel'), 'title': ('steel', 'gold'), 'actionbar': ('steel', 'gold'), 'flag': ('red', 'brown'),
    'chart': ('teal', 'steel'), 'note': ('pink', 'purple'), 'megaphone': ('orange', 'steel'), 'menu': ('steel', 'gold'),
    'terminal': ('steel', 'green'),
    # time
    'clock': ('gold', 'red'), 'hourglass': ('brown', 'gold'), 'calendar': ('red', 'steel'), 'loop': ('teal', 'gold'),
    # places and finding
    'target': ('red', 'gold'), 'search': ('steel', 'blue'), 'map': ('gold', 'red'), 'pin': ('red', 'steel'),
    'radar': ('teal', 'red'), 'tower': ('steel', 'gold'), 'house': ('brown', 'red'), 'door': ('brown', 'gold'),
    'bed': ('red', 'steel'),
    # containers
    'chest': ('brown', 'gold'), 'chest_open': ('brown', 'gold'), 'bag': ('brown', 'gold'), 'box': ('brown', 'gold'),
    'grid': ('brown', 'steel'), 'magnet': ('red', 'steel'),
    # contraptions and play
    'lever': ('steel', 'red'), 'button': ('steel', 'red'), 'gear': ('steel', 'orange'), 'film': ('steel', 'red'),
    'dice': ('steel', 'red'), 'firework': ('red', 'gold'), 'bomb': ('steel', 'orange'), 'gamepad': ('purple', 'green'),
}

# A badge says one thing, in one hue, and becomes the symbol's accent: more green, less red, a way to go blue...
BADGE_COLOURS = {
    'plus': 'green', 'minus': 'red', 'up': 'green', 'down': 'red', 'right': 'blue', 'left': 'blue', 'check': 'green',
    'cross': 'red', 'star': 'gold', 'flag': 'red', 'dot': 'teal', 'loop': 'teal', 'bolt': 'gold', 'drop': 'blue',
    'pause': 'orange',
}


def colours(name: str) -> dict:
    """
    {@return the hues of "base" or "base+badge": the base's main, and the badge's hue, or the base's accent for no badge or
    a badge in the base's own hue (a minus on a red heart would vanish into it)}
    """
    base, _, badge = name.partition('+')
    main, accent = COLOURS[base]
    hue = BADGE_COLOURS.get(badge, accent)
    return {'main': main, 'accent': hue if hue != main else accent}


def look(name: str) -> tuple:
    """{@return what a symbol looks like: its grid and its colours}"""
    c = colours(name)
    return (*symbol(name), c['main'], c['accent'])

# type id -> "base" or "base+badge", by category
OBJECTIVES = {
    'accept_teleport_request': 'portal+check', 'activate_set': 'armor+star', 'advancement': 'trophy', 'anvil': 'anvil',
    'assign_expertise': 'book+plus', 'assign_expertise_to': 'book+right', 'become_party_leader': 'crown',
    'block_break': 'pickaxe', 'block_place': 'cube', 'bonemeal': 'sprout', 'break_item': 'crack', 'breed': 'heart+plus',
    'brew': 'potion', 'bucket_mob': 'bucket+dot', 'change_world': 'globe+right', 'chat': 'speech',
    'collect': 'bag', 'compost': 'compost', 'consume': 'apple', 'convo_answer': 'speech+check', 'convo_finish': 'speech+flag',
    'convo_start': 'speech+right', 'craft': 'grid', 'create_party': 'people+plus', 'cure_villager': 'npc+plus',
    'custom': 'gear', 'damage_tyche': 'boss+down', 'damaged_by_tyche': 'shield+cross', 'deal_damage': 'sword+up',
    'deal_vanilla_damage': 'swords', 'death': 'tombstone', 'deliver': 'box+right', 'earn_coins': 'coin+plus',
    'empty_bucket': 'bucket+down', 'enchant': 'wand', 'enter_biome': 'tree', 'equip_accessory': 'ring+plus',
    'equip_item': 'armor+plus', 'fill_bucket': 'bucket+drop', 'find_structure': 'map', 'fish': 'hook',
    'fuse_item': 'gem+plus', 'gain_effect': 'sparkle+plus', 'gain_experience': 'orb+plus', 'gain_reputation': 'star+up',
    'gain_vanilla_experience': 'orb+up', 'grindstone': 'grind', 'harvest': 'wheat', 'interact_tyche_mob': 'hand',
    'invite_to_party': 'letter+plus', 'join_party': 'people+right', 'jump': 'leap', 'kill_mob': 'sword',
    'kill_player': 'person+cross', 'kill_tyche_boss': 'boss', 'kill_tyche_mob': 'skull', 'kill_tyche_npc': 'npc+cross',
    'killed_by_tyche': 'skull+down', 'leave_party': 'door', 'level_up': 'rank', 'lose_reputation': 'star+down',
    'lose_title': 'tag+minus', 'make_path': 'feet+dot', 'milk': 'bucket', 'open_loot_chest': 'chest_open',
    'open_rpg_menu': 'menu', 'pay_player': 'coin+right', 'pickup': 'magnet', 'playtime': 'hourglass',
    'plutus_group': 'ore+star', 'plutus_loot': 'ore+up', 'plutus_loot_item': 'ore+dot', 'reach_boss_phase': 'boss+up',
    'reach_level': 'rank+flag', 'reach_location': 'pin', 'reach_reputation': 'star+flag', 'reach_vanilla_level': 'orb+flag',
    'receive_payment': 'coin+left', 'reforge_item': 'hammer', 'remove_effect': 'sparkle+minus', 'repair_item': 'wrench',
    'roll_reforge': 'dice', 'run_command': 'terminal', 'scrape': 'axe+minus', 'shear': 'scissors', 'shoot': 'bow',
    'sleep': 'bed', 'smelt': 'flame', 'smith': 'anvil+up', 'socket_gem': 'gem+down', 'spend_coins': 'coin+minus',
    'spend_pool': 'flask+minus', 'strip': 'axe', 'summon_tyche_boss': 'boss+plus', 'take_damage': 'heart+minus',
    'take_party_role': 'people+star', 'take_vanilla_damage': 'heart_broken', 'talk_npc': 'npc',
    'tame': 'paw', 'throw': 'dots', 'till': 'hoe', 'toggle_auto_loot': 'lever', 'trade': 'trade', 'travel_distance': 'feet',
    'tyche_loot': 'chest+star', 'tyche_npc_dies': 'ghost', 'unequip_accessory': 'ring+minus', 'unlock_title': 'tag+plus',
    'unsocket_gem': 'gem+up', 'upgrade_bag': 'bag+up', 'use_command_item': 'staff', 'use_rpg_button': 'button',
    'use_teleport': 'portal', 'use_totem': 'totem', 'use_warp': 'swirl', 'watch_cutscene': 'film', 'wax': 'honeycomb',
    'wear_item': 'armor', 'wear_out_item': 'sword+minus', 'wear_title': 'tag', 'win_raid': 'flag',
    # Phantasos
    'skip_cutscene': 'film+right',
    # Tyche NPCs: a click on an NPC (talking is Convo's talk_npc)
    'interact_tyche_npc': 'npc+dot',
}
REQUIREMENTS = {
    'advancement_done': 'trophy', 'auto_loot': 'magnet', 'bag_tier': 'bag+up', 'can_use_warp': 'swirl+check', 'coins': 'coin',
    'container_has_item': 'chest', 'container_has_vulcan_item': 'chest+star', 'effect': 'sparkle', 'entities_nearby': 'radar',
    'expertise': 'book', 'food': 'apple', 'gamemode': 'gamepad', 'has_item': 'bag', 'has_title': 'tag',
    'has_socketed_gem': 'gem+down', 'has_vulcan_gem': 'gem', 'has_vulcan_item': 'gem+star', 'have_effect': 'sparkle+check', 'health': 'heart', 'in_biome': 'tree',
    'in_dimension': 'portal', 'in_party': 'people', 'in_structure': 'tower', 'in_world': 'globe', 'level': 'rank',
    'near_location': 'pin', 'near_tyche_npc': 'npc+dot', 'not_have_effect': 'sparkle+cross', 'party_balanced': 'scales',
    'party_leader': 'crown', 'party_members_near': 'people+dot', 'party_role': 'people+star', 'permission': 'lock',
    'plutus_pity': 'ore', 'pool': 'flask', 'pool_level': 'rank+star', 'potion_effect': 'potion',
    'quest_active': 'scroll+pause', 'quest_completed': 'scroll+check', 'quest_completions': 'scroll+star',
    'quest_failed': 'scroll+cross', 'quest_not_started': 'scroll+minus', 'real_time': 'calendar', 'reputation': 'star',
    'stat': 'dumbbell', 'statistic': 'chart', 'time_of_day': 'clock', 'tyche_boss_kills': 'boss',
    'tyche_bosses_nearby': 'boss+dot', 'tyche_mob_kills': 'skull', 'tyche_mobs_nearby': 'skull+dot',
    'tyche_npc_alive': 'npc+check', 'tyche_npc_in_combat': 'swords', 'vanilla_level': 'orb', 'wearing': 'armor',
    'wearing_accessory': 'ring', 'wearing_title': 'tag+check', 'weather': 'cloud',
    # Phantasos
    'seen_cutscene': 'film+check', 'watching_cutscene': 'film',
}
REWARDS = {
    'abandon_quest': 'scroll+minus', 'actionbar': 'actionbar', 'broadcast': 'megaphone', 'clear_effects': 'sparkle+cross',
    'clear_potion_effects': 'potion+cross', 'coins': 'coin', 'command': 'terminal', 'complete_quest': 'scroll+check',
    'custom_item': 'gem+star', 'equip_title': 'tag+check', 'experience': 'spark', 'explosion': 'bomb', 'fail_quest': 'scroll+cross',
    'feed': 'apple', 'firework': 'firework', 'give_effect': 'sparkle+plus', 'give_title': 'tag+plus', 'heal': 'heart+plus',
    'hold_tyche_npc': 'npc+pause', 'item': 'gem', 'items': 'gem+plus', 'lightning': 'bolt', 'message': 'letter',
    'particles': 'dots', 'play_cutscene': 'film', 'plutus_loot': 'ore', 'potion_effect': 'potion',
    'progress_objective': 'target+up', 'remove_effect': 'sparkle+minus', 'remove_potion_effect': 'potion+minus',
    'reputation': 'star', 'reset_quest': 'scroll+loop', 'reset_reputation': 'star+loop', 'restore_pool': 'flask+plus',
    'set_bag_tier': 'bag+up', 'set_block': 'cube', 'set_npc_hostility': 'npc+bolt', 'set_reputation': 'star+check',
    'set_time': 'clock', 'set_warp_enabled': 'lever', 'set_weather': 'cloud', 'sound': 'note', 'spawn': 'house',
    'start_convo': 'speech+right', 'start_quest': 'scroll+right', 'summon_mob': 'egg', 'summon_tyche_boss': 'boss+plus',
    'summon_tyche_mob': 'skull+plus', 'take_coins': 'coin+minus', 'take_item': 'bag+minus', 'take_title': 'tag+minus',
    'teleport': 'portal', 'teleport_to_npc': 'npc+right', 'title': 'title', 'tyche_loot': 'chest+star',
    'vanilla_experience': 'orb', 'vanilla_levels': 'orb+up', 'vulcan_gem': 'gem+up', 'vulcan_item': 'sword+star',
    'vulcan_items': 'swords+star', 'warp': 'swirl',
    # Phantasos
    'stop_cutscene': 'film+cross', 'mark_cutscene_seen': 'film+check',
    # ExperienceTailor
    'set_hud': 'menu',
}
ASSIGNED = {'objective': OBJECTIVES, 'requirement': REQUIREMENTS, 'reward': REWARDS}


def symbol(name: str) -> list[str]:
    """{@return the grid of "base" or "base+badge"}"""
    base, _, badge = name.partition('+')
    rows = [list(r) for r in BASES[base]]
    if badge:
        # The badge's hue is the one accent: the base's own accent pixels fall back to its dimmed main hue
        rows = [['+' if c == 'o' else c for c in r] for r in rows]
        for y in range(5):
            for x in range(5):
                rows[7 + y][7 + x] = BADGES[badge][y][x]
    return [''.join(r) for r in rows]


def main():
    root = pathlib.Path(__file__).resolve().parents[2]
    problems = []
    problems += [f'{base}: no colours' for base in sorted(set(BASES) - set(COLOURS))]
    problems += [f'badge {badge}: no colour' for badge in sorted(set(BADGES) - set(BADGE_COLOURS))]
    for name, hues in [*COLOURS.items(), *((b, (h,)) for b, h in BADGE_COLOURS.items())]:
        problems += [f'{name}: {h} is not in the palette' for h in hues if h not in PALETTE]
    problems += [f'{base}: its accent is its main hue' for base, (main, accent) in COLOURS.items() if main == accent]
    for name, grid in {**BASES, **{f'badge {k}': v for k, v in BADGES.items()}}.items():
        size = 12 if not name.startswith('badge') else 5
        if len(grid) != size or any(len(r) != size for r in grid):
            problems.append(f'{name}: not {size}x{size}: {[len(r) for r in grid]}')
        if any(set(r) - ALLOWED for r in grid):
            problems.append(f'{name}: unknown characters')
    if problems:
        raise SystemExit('\n'.join(problems))

    types = json.loads((root / 'test/fixtures/type-ids.json').read_text(encoding='utf-8'))
    for t in types:
        if t['id'] not in ASSIGNED[t['category']]:
            problems.append(f"{t['category']} {t['id']}: no symbol")
    for category, assigned in ASSIGNED.items():
        seen = {look(FALLBACKS[category]): f'the {category} fallback'}
        for tid, name in sorted(assigned.items()):
            grid = look(name)
            if grid in seen:
                problems.append(f'{category} {tid} ({name}) looks like {seen[grid]}')
            seen[grid] = tid
    if problems:
        raise SystemExit('\n'.join(problems))

    names = sorted({n for a in ASSIGNED.values() for n in a.values()} | set(FALLBACKS.values()))
    data = {
        'fallbacks': FALLBACKS,
        'palette': PALETTE,
        'types': {c: dict(sorted(a.items())) for c, a in ASSIGNED.items()},
        'symbols': {n: symbol(n) for n in names},
        'colours': {n: colours(n) for n in names},
    }
    out = root / 'src/data/type-icons.json'
    out.write_text(json.dumps(data, indent=1) + '\n', encoding='utf-8')
    print(f'{sum(len(a) for a in ASSIGNED.values())} types, {len(names)} symbols -> {out.relative_to(root)}')
    if len(sys.argv) > 1:
        sheet(pathlib.Path(sys.argv[1]), data)


def sheet(path: pathlib.Path, data: dict):
    border = {'objective': '#f5b83d', 'requirement': '#2fc7b3', 'reward': '#a78bfa'}

    def svg(grid, colour, accent, size):
        dim = ' fill-opacity="0.55"'
        rects = ''.join(
            f'<rect x="{x}" y="{y}" width="1" height="1" fill="{accent if c == "o" else colour}"'
            f'{dim if c == "+" else ""}/>'
            for y, row in enumerate(grid) for x, c in enumerate(row) if c != '.')
        return f'<svg viewBox="0 0 12 12" width="{size}" height="{size}" shape-rendering="crispEdges">{rects}</svg>'

    parts = []
    for category, assigned in data['types'].items():
        tile = f' style="border-color:{border[category]}80;background:color-mix(in srgb,{border[category]} 7%,#161a21)"'
        parts.append(f'<h2>{category}s</h2><div class="row">')
        for tid, name in [('(unknown)', data['fallbacks'][category]), *assigned.items()]:
            grid = data['symbols'][name]
            colour, accent = (data['palette'][data['colours'][name][k]] for k in ('main', 'accent'))
            parts.append(f'<figure><div class="tile"{tile}>{svg(grid, colour, accent, 24)}</div>{svg(grid, colour, accent, 48)}'
                         f'<figcaption>{tid}<br><small>{name}</small></figcaption></figure>')
        parts.append('</div>')
    path.write_text(f'''<!doctype html><meta charset="utf-8"><title>Type icons</title>
<style>body{{background:#0b0d11;color:#d1d5db;font:11px sans-serif;padding:12px}}.row{{display:flex;flex-wrap:wrap;gap:6px}}
figure{{margin:0;width:96px;display:flex;flex-direction:column;align-items:center;gap:3px}}
.tile{{width:36px;height:36px;display:grid;place-items:center;background:#161a21;border:1px solid #2a313c;border-radius:8px}}
figcaption{{text-align:center;word-break:break-all}}small{{color:#6b7280}}</style>{"".join(parts)}''', encoding='utf-8')
    print('sheet ->', path)


if __name__ == '__main__':
    main()
