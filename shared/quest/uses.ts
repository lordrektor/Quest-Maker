/**
 * Where a requirement sits (its use) and what each use accepts (the catalog's requirementUses: the traits a use takes).
 * A type, or one of its arguments, can read something only some uses can wait for: a spot away from the player
 * (container_has_item, the world / x / y / z of entities_nearby) cannot be read in fail.unless, checked every second,
 * or for an auto_start quest. The plugin checks the same (DefinitionValidator); these are its messages.
 */
import type { Catalog, ParamDto, TypeDto } from '../creator'
import type { ArgMap, Value } from './canonical'

export type RequirementUse = 'start' | 'auto_start' | 'fail_unless' | 'reward'

/** How a use is named in messages. */
export const USE_LABELS: Record<RequirementUse, string> = {
  start: 'requirements',
  auto_start: 'the requirements of an auto_start quest',
  fail_unless: 'fail.unless',
  reward: 'reward requirements',
}

/** Why a trait is refused, by trait. */
const TRAIT_WHY: Record<string, string> = {
  spot: 'it reads a spot away from the player, which may be far away or not loaded',
  players: 'it reads other players, who may be on other regions',
}

function why(trait: string): string {
  return TRAIT_WHY[trait] ?? `it reads ${trait}`
}

/** {@return the use of a quest's requirements: auto_start when it starts by itself, else start} */
export function requirementsUse(autoStart: boolean): RequirementUse {
  return autoStart ? 'auto_start' : 'start'
}

/** {@return the traits a use accepts, or null when the catalog does not say (everything is accepted)} */
export function accepted(catalog: Catalog | undefined, use: RequirementUse): string[] | null {
  const uses = catalog?.types?.requirementUses
  if (!uses) return null
  return uses[use] ?? []
}

/** {@return the first of some traits a use refuses, or null} */
export function refusedTrait(catalog: Catalog | undefined, use: RequirementUse, reads: string[] | undefined): string | null {
  const ok = accepted(catalog, use)
  if (!ok || !reads) return null
  return reads.find((trait) => !ok.includes(trait)) ?? null
}

/** {@return true when a use takes a type (none of the type's own traits refused)} */
export function takesType(catalog: Catalog | undefined, use: RequirementUse, type: TypeDto): boolean {
  return refusedTrait(catalog, use, type.reads) === null
}

/** {@return true when a use takes an argument (none of its traits refused)} */
export function takesParam(catalog: Catalog | undefined, use: RequirementUse, param: ParamDto): boolean {
  return refusedTrait(catalog, use, param.reads) === null
}

function filled(value: Value | undefined): boolean {
  return value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0)
}

/** One problem of a requirement's use: the argument it is about ('type' for the type) and the message. */
export interface UseProblem {
  at: string
  message: string
}

/**
 * {@return the problems of a requirement in a use, in the plugin's order: a type trait the use refuses (then nothing
 * else); spot arguments filled in only partly; a filled argument whose trait the use refuses (once)}
 */
export function useProblems(catalog: Catalog | undefined, use: RequirementUse, spec: TypeDto, args: ArgMap): UseProblem[] {
  const label = USE_LABELS[use]
  const typeTrait = refusedTrait(catalog, use, spec.reads)
  if (typeTrait) return [{ at: 'type', message: `${spec.id} cannot be used in ${label}: ${why(typeTrait)}` }]
  const problems: UseProblem[] = []
  const values = new Map(args)
  const spots = spec.params.filter((p) => p.reads?.includes('spot'))
  const set = spots.filter((p) => filled(values.get(p.name)))
  if (set.length > 0 && set.length < spots.length) {
    const missing = spots.find((p) => !filled(values.get(p.name)))!
    problems.push({ at: missing.name, message: `${spots.map((p) => p.name).join(', ')} go together: all of them for a spot, or none for around the player` })
  }
  for (const param of spec.params) {
    const trait = filled(values.get(param.name)) ? refusedTrait(catalog, use, param.reads) : null
    if (!trait) continue
    const noun = trait === 'spot' ? 'a spot' : trait
    const hint = trait === 'spot' ? `; leave ${spots.map((p) => p.name).join(', ')} empty to use the player's place` : ''
    problems.push({ at: param.name, message: `${noun} cannot be used in ${label}: ${why(trait)}${hint}` })
    break
  }
  return problems
}

/** {@return why a requirement cannot sit in a use (the first of its use problems), or null} */
export function useRefusal(catalog: Catalog | undefined, use: RequirementUse, spec: TypeDto | undefined, args: ArgMap): string | null {
  if (!spec) return null
  const typeTrait = refusedTrait(catalog, use, spec.reads)
  if (typeTrait) return `${spec.id} cannot be used in ${USE_LABELS[use]}: ${why(typeTrait)}`
  // Only what the use refuses: a spot filled in partly is a problem anywhere
  return useProblems(catalog, use, spec, args).find((p) => !/ go together: /.test(p.message))?.message ?? null
}
