"""One-off: the type icon fixture for ChronosCreator's tests, from the plugin's TypeIcons and type registrations.

Usage (from the project folder): python scripts/item_icons/make_type_icons.py ../Chronos .
Writes <creator>/test/fixtures/type-icons.json: [{ id, category, material }], sorted.
"""
import json
import pathlib
import re
import sys

chronos = pathlib.Path(sys.argv[1])
creator = pathlib.Path(sys.argv[2])

icons_src = (chronos / 'src/main/java/xyz/lordrektor/chronos/editor/TypeIcons.java').read_text(encoding='utf-8')
icons = dict(re.findall(r'Map\.entry\("([a-z_]+)", Material\.([A-Z_]+)\)', icons_src))

categories: dict[str, set[str]] = {}
for f in (chronos / 'src/main/java').rglob('*.java'):
    text = f.read_text(encoding='utf-8')
    for cat, tid in re.findall(r'TypeCategory\.(OBJECTIVE|REQUIREMENT|REWARD),\s*"([a-z_]+)"', text):
        categories.setdefault(tid, set()).add(cat.lower())
    for helper, tid in re.findall(r'\b(objective|requirement|reward)[A-Za-z]*\((?:catalog|c),\s*"([a-z_]+)"', text):
        categories.setdefault(tid, set()).add(helper)
    # TypeCatalog.objective / requirement / reward (Chronos 1.2.1): catalog.objective(OWNER, "custom", ...)
    for helper, tid in re.findall(r'\.(objective|requirement|reward)\(\s*[A-Za-z_.]+,\s*"([a-z_]+)"', text):
        categories.setdefault(tid, set()).add(helper)

# Types other plugins register themselves: the website's sentence maps say which category they are
describe = (creator / 'src/describe.ts').read_text(encoding='utf-8')


def keys_of(name: str) -> set[str]:
    m = re.search(r'export const ' + name + r': Record<[^\n]*= \{\n(.*?)\n\}', describe, re.S)
    return set(re.findall(r'^  ([a-z_]+):', m.group(1), re.M)) if m else set()


web = {'objective': keys_of('OBJECTIVES'), 'requirement': keys_of('REQUIREMENTS'), 'reward': keys_of('REWARDS') | keys_of('ACTIONS')}
rows = []
missing = []
for tid, material in sorted(icons.items()):
    cats = categories.get(tid, set()) | {c for c, ks in web.items() if tid in ks}
    if not cats:
        missing.append(tid)
        continue
    for cat in sorted(cats):
        rows.append({'id': tid, 'category': cat, 'material': 'minecraft:' + material.lower()})

out = creator / 'test/fixtures/type-icons.json'
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(rows, indent=2) + '\n', encoding='utf-8')
print(len(icons), 'ids,', len(rows), 'rows,', len({r['material'] for r in rows}), 'materials; no category:', missing)
