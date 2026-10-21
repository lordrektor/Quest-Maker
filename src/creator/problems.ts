/**
 * The problems of every quest on a workspace, as the plugin would report them (shared/quest), plus the canvas's own
 * (loose parts, empty stages), each pointed at the part it is about.
 */
import type { Problem } from '../../shared/creator'
import { canonicalQuest } from '../../shared/quest/canonical'
import { CYCLE_MESSAGE, requirementCycles, validateQuest } from '../../shared/quest/validate'
import type { Quest } from '../../shared/quest/canonical'
import type { CatalogView } from './catalog'
import { modelToTree, type Nid, type QuestModel } from './model'
import { shapeWarnings } from './ops'
import type { WorkspaceModel } from './workspace'

export interface PartProblem extends Problem {
  quest: string
  /** The part: start, finish, fail, a stage or entry nid. */
  key: string
}

/** {@return the part a problem path is about} */
export function partOf(model: QuestModel, path: string): string {
  const objectiveReward = /^objectives\.([a-z0-9_]+)\.(rewards|callbacks)\[(\d+)\]/.exec(path)
  if (objectiveReward) {
    const objective = Object.values(model.entries).find((e) => e.objectiveId === objectiveReward[1] && e.category === 'objective'
      && !model.fail.when.includes(e.nid) && !model.loose.includes(e.nid))
    const reward = (objectiveReward[2] === 'callbacks' ? objective?.callbacks : objective?.rewards)?.[Number(objectiveReward[3])]
    if (reward) return reward
    if (objective) return objective.nid
  }
  const stage = /^stages\.(\d+)(?:\.(rewards|callbacks)\[(\d+)\])?/.exec(path)
  if (stage) {
    const found = Object.values(model.stages).find((s) => s.number === Number(stage[1]) && model.chain.includes(s.nid))
    const list = stage[2] === 'callbacks' ? found?.callbacks : found?.rewards
    if (found && stage[3] !== undefined && list?.[Number(stage[3])]) return list[Number(stage[3])]!
    if (found) return found.nid
  }
  const callback = /^callbacks\.(start|complete|fail|abandon|expire)(?:\[(\d+)\])?/.exec(path)
  if (callback) {
    const list = model.callbacks[callback[1] as keyof QuestModel['callbacks']]
    return (callback[2] !== undefined ? list[Number(callback[2])] : undefined) ?? 'callbacks'
  }
  if (path.startsWith('callbacks')) return 'callbacks'
  const objective = /^objectives\.([a-z0-9_]+)/.exec(path)
  if (objective) {
    const found = Object.values(model.entries).find((e) => e.objectiveId === objective[1] && e.category === 'objective'
      && !model.fail.when.includes(e.nid) && !model.loose.includes(e.nid))
    if (found) return found.nid
  }
  if (path === 'objectives') return model.chain[0] ?? 'start'
  const indexed = /^(requirements|rewards|fail\.when|fail\.unless|fail\.actions)\[(\d+)\]((?:\.(?:all|any)\[\d+\])*)/.exec(path)
  if (indexed) {
    const list = {
      requirements: model.requirements, rewards: model.rewards, 'fail.when': model.fail.when, 'fail.unless': model.fail.unless,
      'fail.actions': model.fail.actions,
    }[indexed[1]!]!
    let nid = list[Number(indexed[2])]
    // Down through groups (requirements[0].all[1].any[1]): the deepest part that is there
    for (const step of indexed[3]!.matchAll(/\.(?:all|any)\[(\d+)\]/g)) {
      const member = nid ? model.entries[nid]?.members?.filter((m) => model.entries[m])[Number(step[1])] : undefined
      if (!member) break
      nid = member
    }
    return nid ?? 'start'
  }
  if (path.startsWith('fail')) return 'fail'
  if (path.startsWith('messages.complete') || path.startsWith('notices.complete')) return 'finish'
  if (path.startsWith('notices.fail')) return 'fail'
  return 'start'
}

export interface Checked {
  problems: PartProblem[]
  /** Problems by quest, then by part. */
  byPart: Map<string, Map<string, PartProblem[]>>
  errors: number
  warnings: number
}

/** {@return every problem of the workspace} */
export function checkWorkspace(ws: WorkspaceModel, catalog: CatalogView | null, exists: (id: string) => boolean | undefined): Checked {
  const problems: PartProblem[] = []
  const read = new Map<string, Quest>()
  const pools = catalog ? new Map(catalog.pools.map((p) => [p.id, { type: p.type }])) : null
  for (const id of ws.order) {
    const model = ws.quests[id]!.model
    const tree = modelToTree(model)
    const canonical = canonicalQuest(tree, id)
    const list: Problem[] = [...canonical.problems]
    if (canonical.quest) {
      read.set(id, canonical.quest)
      list.push(...validateQuest(canonical.quest, {
        catalog: catalog?.response.catalog, refs: catalog?.response.refs, pools,
        questExists: (q) => (ws.quests[q] ? true : exists(q)),
      }))
    }
    for (const p of list) problems.push({ ...p, quest: id, key: partOf(model, p.path) })
    for (const w of shapeWarnings(model)) problems.push({ path: '', message: w.message, error: false, quest: id, key: w.nid ?? 'start' })
  }
  for (const id of requirementCycles(read)) problems.push({ path: 'requirements', message: CYCLE_MESSAGE, error: false, quest: id, key: 'start' })
  const byPart = new Map<string, Map<string, PartProblem[]>>()
  for (const p of problems) {
    const quest = byPart.get(p.quest) ?? byPart.set(p.quest, new Map()).get(p.quest)!
    ;(quest.get(p.key) ?? quest.set(p.key, []).get(p.key)!).push(p)
  }
  return { problems, byPart, errors: problems.filter((p) => p.error).length, warnings: problems.filter((p) => !p.error).length }
}

/** {@return the worst problem level of a part: error, warning or none} */
export function levelOf(checked: Checked, quest: string, key: Nid): 'error' | 'warning' | null {
  const list = checked.byPart.get(quest)?.get(key)
  if (!list || list.length === 0) return null
  return list.some((p) => p.error) ? 'error' : 'warning'
}
