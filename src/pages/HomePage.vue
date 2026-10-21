<script setup lang="ts">
/**
 * The public showcase of what Chronos can do. It is static: the samples are written in src/showcase/ and turned into
 * lines by describe.ts; nothing here asks the server.
 */
import PixelIcon from '../components/PixelIcon.vue'
import ChronosLogo from '../components/ChronosLogo.vue'
import Chip from '../components/Chip.vue'
import ItemIcon from '../components/ItemIcon.vue'
import LineList from '../components/LineList.vue'
import TypeIcon from '../components/TypeIcon.vue'
import { categoryTint } from '../typeIcons'
import MiniText from '../components/MiniText.vue'
import QuestPreview from '../components/QuestPreview.vue'
import {
  describeAction, describeFail, objectiveStages, poolLevels, requirementLines, resetLine, rewardLines, rollLine, str,
} from '../describe'
import {
  CALLBACK_SAMPLE, CHAIN, CHAIN_LINKS, COUNTS, CREATOR_STEPS, FAIL_SAMPLE, INTEGRATIONS, NOTICES, OBJECTIVE_FAMILIES, PLATFORM, POOL_SAMPLES,
  REQUIREMENT_SAMPLES, REWARD_SAMPLES, SILENT_REWARD_TYPES, STAGE_SAMPLE, type Integration,
} from '../showcase/capabilities'
import { EXAMPLE_QUEST } from '../showcase/example-quest'
import ShowcaseSection from '../showcase/ShowcaseSection.vue'
import { usePageTitle } from '../title'

usePageTitle(() => null)

const stages = objectiveStages(STAGE_SAMPLE.objectives, STAGE_SAMPLE.stages)
const requirements = requirementLines(REQUIREMENT_SAMPLES)
const rewards = rewardLines(REWARD_SAMPLES)
const fail = describeFail(FAIL_SAMPLE)
const callbacks = CALLBACK_SAMPLE.map((step) => ({ when: step.when, lines: step.actions.map(describeAction) }))
const pools = POOL_SAMPLES.map((pool) => ({
  ...pool,
  name: str(pool.body.name) ?? pool.id,
  reset: resetLine(pool.body),
  roll: rollLine(pool.body),
  shared: pool.body.shared_rolls === true,
  levels: poolLevels(pool.body),
}))

const STATS = [
  { value: String(COUNTS.objectives), label: 'objective types', icon: 'objective' },
  { value: String(COUNTS.requirements), label: 'requirement types', icon: 'requirement' },
  { value: String(COUNTS.rewards), label: 'reward types', icon: 'reward' },
  { value: String(COUNTS.integrations), label: 'plugin integrations', icon: 'plug' },
]

/** The quest a notice names in its subtitle. */
const NOTICE_PLACEHOLDERS = { quest: "Hunter's Vow" }

function typeGroups(plugin: Integration): { label: string; category: 'objective' | 'requirement' | 'reward'; types: string[] }[] {
  return [
    { label: 'Objectives', category: 'objective' as const, types: plugin.objectives },
    { label: 'Requirements', category: 'requirement' as const, types: plugin.requirements },
    { label: 'Rewards', category: 'reward' as const, types: plugin.rewards },
  ].filter((group) => group.types.length > 0)
}

const STEP_ICONS = ['key', 'workspace', 'download']

const TYPE_CHIP = 'inline-flex items-center gap-1.5 rounded-md border border-night-700 bg-night-850 px-2 py-0.5 font-mono text-xs text-night-200'
</script>

<template>
  <!-- Hero -->
  <section class="pb-12 sm:pb-16" aria-labelledby="hero-title">
    <div class="flex items-center justify-between gap-10">
    <div>
    <p class="eyebrow mb-3">Chronos · quests for Folia servers</p>
    <h1 id="hero-title" class="max-w-3xl text-3xl leading-tight font-bold tracking-tight text-night-100 sm:text-5xl">
      Story chapters, daily rotations and boss hunts, <span class="text-gold-400">all from one quest plugin.</span>
    </h1>
    <p class="mt-4 max-w-2xl text-base text-night-300 sm:text-lg">
      Chronos runs quests in stages with objectives side by side, gates them with requirements, pays out rewards,
      fails them by rule, and chains them into storylines. Build them in game, in YAML, or on this site's canvas.
    </p>
    <div class="mt-7 flex flex-wrap gap-3">
      <RouterLink to="/create" class="rounded-xl bg-gold-400 px-5 py-3 font-semibold text-night-950 transition hover:bg-gold-300">Open the creator</RouterLink>
      <a href="#example" class="rounded-xl border border-night-600 px-5 py-3 font-semibold text-night-100 hover:border-gold-400">See an example quest</a>
    </div>
    </div>
    <div class="relative hidden shrink-0 lg:block" aria-hidden="true">
      <div class="absolute inset-6 rounded-full bg-gold-400/15 blur-3xl" />
      <ChronosLogo :size="200" class="relative" />
    </div>
    </div>
    <dl class="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="stat in STATS" :key="stat.label" class="card flex flex-col px-4 py-3">
        <dt class="text-sm text-night-400">{{ stat.label }}</dt>
        <dd class="order-first flex items-center gap-2 font-display text-2xl text-gold-300"><PixelIcon :name="stat.icon" :size="20" coloured />{{ stat.value }}</dd>
      </div>
    </dl>
  </section>

  <ShowcaseSection id="stages" icon="stage" eyebrow="Stages" title="Objectives side by side, stages one after another">
    <p>
      A quest is a chain of numbered stages. Every objective in a stage counts at the same time, in any order; the
      next stage opens when all of them are done.
    </p>
    <p>
      About {{ COUNTS.objectives }} objective types cover breaking, killing, crafting, exploring and more. Filters
      narrow any of them to worlds, heights or the item in hand.
    </p>
    <p>
      Objectives and stages can pay out on their own: an objective's rewards come the moment it is done, a stage's
      once all its objectives are, and the last stage's just before the quest's own. Each is given once per run.
    </p>
    <template #sample>
      <div class="card p-5 sm:p-6">
        <ol class="space-y-6">
          <li v-for="(stage, i) in stages" :key="stage.stage" class="relative pl-9">
            <span
              aria-hidden="true"
              class="absolute top-0 left-0 grid size-6 place-items-center rounded-md border border-gold-400/50 bg-gold-900/60 font-display text-xs text-gold-300"
            >{{ i + 1 }}</span>
            <span v-if="i < stages.length - 1" aria-hidden="true" class="absolute top-7 bottom-[-1.25rem] left-3 w-px bg-night-700" />
            <h3 class="mb-2 text-sm font-semibold text-night-200">Stage {{ i + 1 }} <span class="font-normal text-night-400">· {{ stage.lines.length }} in parallel</span></h3>
            <LineList :lines="stage.lines" :quest-links="false" />
            <div v-if="stage.rewards.length" class="mt-2">
              <p class="text-xs text-night-400">When this stage is done:</p>
              <LineList :lines="stage.rewards" marker="+" :quest-links="false" />
            </div>
          </li>
        </ol>
      </div>
      <div class="mt-4 grid gap-3 sm:grid-cols-2">
        <div v-for="family in OBJECTIVE_FAMILIES" :key="family.name" class="card p-4">
          <h3 class="mb-2 text-sm font-semibold text-night-200">{{ family.name }}</h3>
          <ul class="flex flex-wrap gap-1.5" :aria-label="`${family.name} objective types`">
            <li v-for="type in family.types" :key="type">
              <code :class="TYPE_CHIP" :style="categoryTint('objective')"><TypeIcon category="objective" :type="type" :plain="12" />{{ type }}</code>
            </li>
          </ul>
        </div>
      </div>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="requirements" icon="requirement" eyebrow="Requirements" title="Who may start it, and when">
    <p>
      {{ COUNTS.requirements }} requirement types decide who sees a quest: earlier quests completed or failed,
      levels, permissions, items, where the player stands, the time of day or the day of the week, the mobs around
      the player or what a chest at a spot holds.
    </p>
    <p>
      Any requirement can be turned around (<em>Must not</em>: only before the finale is done), and requirements can be
      grouped: <em>all of</em> them or <em>any of</em> them, a group reversible too. The same rules keep a quest
      running in its fail conditions.
    </p>
    <p>A quest can stay hidden until its requirements are met, so later chapters are a surprise.</p>
    <template #sample>
      <div class="card p-5 sm:p-6">
        <h3 class="eyebrow mb-4">Requirements</h3>
        <LineList :lines="requirements" marker="◆" :quest-links="false" />
      </div>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="rewards" icon="reward" eyebrow="Rewards" title="Pay out anything">
    <p>
      {{ COUNTS.rewards }} reward types: items, experience, effects, teleports, mobs, the next quest, or any command
      with a line of your own for the quest list.
    </p>
    <p>
      Some rewards only make noise and stay off the list:
      <template v-for="(type, i) in SILENT_REWARD_TYPES" :key="type"><code class="text-night-200">{{ type }}</code>{{ i < SILENT_REWARD_TYPES.length - 1 ? ', ' : '.' }}</template>
    </p>
    <template #sample>
      <div class="card p-5 sm:p-6">
        <h3 class="eyebrow mb-4">Rewards</h3>
        <LineList :lines="rewards" marker="+" :quest-links="false" />
      </div>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="fail" icon="fail" eyebrow="Fail rules" title="Quests that can be lost">
    <p>
      Any objective type can be a fail condition, and any requirement an exception. Failing resets progress; with a
      cooldown the quest also locks for a while.
    </p>
    <p>
      A failure can do things too, like rewards: start another quest, run a command, send a message. Players keep
      the rewards their objectives and stages already gave.
    </p>
    <p>
      A time limit is not a failure: when it runs out the run just expires. Progress is lost, but the quest can be
      started again at once.
    </p>
    <template #sample>
      <div v-if="fail" class="card border-red-400/25 p-5 sm:p-6">
        <h3 class="eyebrow mb-4 text-red-300">Fail conditions</h3>
        <h4 class="mb-2 text-sm font-semibold text-night-200">Fails if you:</h4>
        <LineList :lines="fail.when" marker="✕" :quest-links="false" />
        <h4 class="mt-4 mb-2 text-sm font-semibold text-night-200">Fails unless:</h4>
        <LineList :lines="fail.unless" marker="!" :quest-links="false" />
        <template v-if="fail.then.length">
          <h4 class="mt-4 mb-2 text-sm font-semibold text-night-200">If it fails:</h4>
          <LineList :lines="fail.then" marker="→" :quest-links="false" />
        </template>
        <p class="mt-4 text-sm text-night-300">{{ fail.result }}</p>
      </div>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="callbacks" icon="bolt" eyebrow="Callbacks" title="Make the world react">
    <p>
      Callbacks run when something happens to a run: it starts, an objective or stage is done, it completes, fails,
      is abandoned or runs out of time. Night falls when the hunt begins, a boss appears at a spot when its whelps are
      slain, a town's reputation rises when the hydra dies.
    </p>
    <p>
      They use the reward types (commands, broadcasts, Kleos reputation, summons) plus the world's time, weather and
      lightning, and players never see them listed.
    </p>
    <template #sample>
      <div class="card border-violet-400/25 p-5 sm:p-6">
        <h3 class="eyebrow mb-4 text-violet-300">Callbacks of a boss hunt</h3>
        <dl class="space-y-4">
          <div v-for="step in callbacks" :key="step.when">
            <dt class="mb-1 text-sm font-semibold text-night-200">{{ step.when }}</dt>
            <dd><LineList :lines="step.lines" marker="⚡" :quest-links="false" /></dd>
          </div>
        </dl>
      </div>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="notices" icon="notice" eyebrow="Notices" title="Titles, sounds, particles and fireworks">
    <p>
      Starting, completing and failing a quest each play a notice: a title and subtitle, a sound (resource-pack
      sounds work), particles and a firework.
    </p>
    <p>The server sets the defaults; a quest can change only the parts it wants, such as its own subtitle.</p>
    <template #sample>
      <ul class="grid gap-3 sm:grid-cols-3">
        <li v-for="notice in NOTICES" :key="notice.event" class="card overflow-hidden">
          <div class="grid min-h-28 place-items-center bg-[radial-gradient(circle_at_50%_30%,rgb(245_184_61/0.12),transparent_70%)] px-3 py-5 text-center">
            <div>
              <MiniText as="p" :text="notice.title" class="font-display text-lg" />
              <MiniText as="p" :text="notice.subtitle" :placeholders="NOTICE_PLACEHOLDERS" class="mt-1 text-sm" />
            </div>
          </div>
          <dl class="space-y-2 border-t border-night-700 p-4 text-xs">
            <div><dt class="text-night-400">Event</dt><dd class="font-semibold text-night-100">{{ notice.event }}</dd></div>
            <div><dt class="text-night-400">Sound</dt><dd class="font-mono break-all text-night-200">{{ notice.sound }}</dd></div>
            <div><dt class="text-night-400">Particles</dt><dd class="font-mono text-night-200">{{ notice.particles }}</dd></div>
            <div><dt class="text-night-400">Firework</dt><dd class="text-night-200">{{ notice.firework ?? 'off' }}</dd></div>
          </dl>
        </li>
      </ul>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="pools" icon="pool" eyebrow="Pools" title="Story chapters and rotating quests">
    <p>
      Every quest belongs to a pool. A story pool lists all its quests; a rotating pool rolls a few per difficulty
      for each player and replaces them on any cron schedule: daily, weekly, Friday evenings in Berlin.
    </p>
    <p>Pools have levels too: completed quests raise them, and each level can pay its own rewards.</p>
    <template #sample>
      <ul class="grid gap-3">
        <li v-for="pool in pools" :key="pool.id" class="card flex gap-4 p-4 sm:p-5">
          <ItemIcon :item="pool.icon" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="text-lg leading-tight font-semibold"><MiniText :text="pool.name" /></h3>
              <Chip :tone="pool.kind === 'story' ? 'easy' : 'accent'">{{ pool.kind === 'story' ? 'Story' : 'Rotating' }}</Chip>
              <Chip v-if="pool.shared" tone="other">Shared rolls</Chip>
            </div>
            <p class="mt-1 text-sm text-night-300">{{ pool.blurb }}</p>
            <ul v-if="pool.reset || pool.roll || pool.levels.levels.length" class="mt-3 space-y-1 text-sm text-night-200">
              <li v-if="pool.reset"><span class="text-gold-400" aria-hidden="true">⟳</span> {{ pool.reset }}</li>
              <li v-if="pool.roll"><span class="text-gold-400" aria-hidden="true">⚄</span> Rolls {{ pool.roll }}</li>
              <li v-if="pool.levels.levels.length">
                <span class="text-gold-400" aria-hidden="true">★</span>
                Levels at {{ pool.levels.levels.map((l) => l.needs).join(', ') }} quests<template v-if="pool.levels.everyLevel.length">;
                  every level: <MiniText v-for="(l, i) in pool.levels.everyLevel" :key="i" :text="l.mini" /></template><template
                  v-for="level in pool.levels.levels.filter((l) => l.rewards.length)"
                  :key="level.level"
                >; level {{ level.level }}: <MiniText v-for="(l, i) in level.rewards" :key="i" :text="l.mini" /></template>
              </li>
            </ul>
          </div>
        </li>
      </ul>
    </template>
  </ShowcaseSection>

  <ShowcaseSection id="chains" icon="link" eyebrow="Quest chains" title="One quest leads to the next">
    <p>
      A <code class="text-night-200">start_quest</code> reward starts the next quest the moment one is finished. A
      <code class="text-night-200">quest_completed</code> requirement keeps a quest locked until another is done.
    </p>
    <p>
      Losing a quest can lead somewhere too: a <code class="text-night-200">start_quest</code> in its fail actions
      starts another the moment it fails, and a <code class="text-night-200">quest_failed</code> requirement opens a
      quest only to players who failed one.
    </p>
    <p>In the creator all four are lines you draw between quests on the canvas.</p>
    <template #sample>
      <div class="card p-5 sm:p-6">
        <ol class="flex max-w-md flex-col">
          <template v-for="quest in CHAIN" :key="quest.id">
            <li v-if="quest.link" class="flex items-center gap-3 pl-[31px]">
              <span aria-hidden="true" class="h-9 border-l-2" :class="CHAIN_LINKS[quest.link].line" />
              <span class="text-xs font-medium" :class="CHAIN_LINKS[quest.link].text">{{ CHAIN_LINKS[quest.link].label }} ↓</span>
            </li>
            <li class="flex min-w-0 items-center gap-3 rounded-xl border border-night-600 bg-night-850 p-3">
              <ItemIcon :item="quest.icon" size="sm" />
              <div class="min-w-0">
                <p class="text-sm leading-tight font-semibold break-words"><MiniText :text="quest.name" /></p>
                <p class="truncate font-mono text-xs text-night-400">{{ quest.id }}</p>
              </div>
            </li>
          </template>
        </ol>
        <ul class="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-night-700 pt-4 text-sm text-night-300">
          <li v-for="(link, kind) in CHAIN_LINKS" :key="kind" class="flex items-center gap-2">
            <span aria-hidden="true" class="w-6 border-t-2" :class="link.line" /> {{ link.label }}: {{ link.legend }}
          </li>
        </ul>
      </div>
    </template>
  </ShowcaseSection>

  <section id="integrations" class="scroll-mt-8 border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="integrations-title">
    <p class="eyebrow mb-3 flex items-center gap-2"><PixelIcon name="plug" :size="16" coloured />Integrations</p>
    <h2 id="integrations-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">More quest types with the plugins you run</h2>
    <p class="mt-4 max-w-2xl text-night-300">
      Each plugin is optional. Installed, it adds its own objectives, requirements and rewards; removed, the quests
      that need it wait until it is back.
    </p>
    <ul class="mt-8 grid gap-4 sm:grid-cols-2">
      <li v-for="plugin in INTEGRATIONS" :key="plugin.name" class="card flex flex-col p-5">
        <h3 class="flex items-center gap-2 font-display text-lg text-gold-300"><PixelIcon name="plug" :size="16" coloured />{{ plugin.name }}</h3>
        <p class="text-sm text-night-400">{{ plugin.what }}</p>
        <p class="mt-3 text-night-200">{{ plugin.text }}</p>
        <dl class="mt-4 space-y-2 text-sm">
          <div v-for="group in typeGroups(plugin)" :key="group.label">
            <dt class="mb-1 text-xs text-night-400">{{ group.label }}</dt>
            <dd class="flex flex-wrap gap-1.5">
              <code v-for="type in group.types" :key="type" :class="TYPE_CHIP" :style="categoryTint(group.category)"><TypeIcon :category="group.category" :type="type" :plain="12" />{{ type }}</code>
            </dd>
          </div>
        </dl>
      </li>
    </ul>
  </section>

  <section id="platform" class="scroll-mt-8 border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="platform-title">
    <p class="eyebrow mb-3 flex items-center gap-2"><PixelIcon name="star" :size="16" coloured />Around the quests</p>
    <h2 id="platform-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">Menus, an editor, and room to grow</h2>
    <p class="mt-4 max-w-2xl text-night-300">
      Players use menus and a tracker; admins build in game or in YAML; the data lives where you want it, on one
      server or a whole network.
    </p>
    <ul class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <li v-for="feature in PLATFORM" :key="feature.title" class="card flex flex-col p-5">
        <PixelIcon :name="feature.icon" :size="28" class="mb-3" coloured />
        <h3 class="font-semibold text-night-100">{{ feature.title }}</h3>
        <p class="mt-2 text-sm text-night-300">{{ feature.text }}</p>
      </li>
    </ul>
  </section>

  <section id="example" class="scroll-mt-8 border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="example-title">
    <p class="eyebrow mb-3 flex items-center gap-2"><PixelIcon name="quest" :size="16" coloured />Example</p>
    <h2 id="example-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">A boss hunt, as players see it</h2>
    <p class="mt-4 mb-8 max-w-2xl text-night-300">
      Two stages, Tyche boss objectives, ExperienceTailor and Vulcan requirements, Chrysos and Vulcan rewards, and a
      fail rule for the hydra's flame breath. The same view previews quests in the creator.
    </p>
    <div class="rounded-2xl border border-gold-400/20 bg-night-900/40 p-5 sm:p-8">
      <QuestPreview :body="EXAMPLE_QUEST" :quest-links="false" :level="2" />
    </div>
  </section>

  <section id="creator" class="scroll-mt-8 border-t border-night-800/80 pt-12 sm:pt-16" aria-labelledby="creator-title">
    <p class="eyebrow mb-3 flex items-center gap-2"><PixelIcon name="workspace" :size="16" coloured />The web creator</p>
    <h2 id="creator-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">Draw quests on a canvas, play them in game</h2>
    <p class="mt-4 max-w-2xl text-night-300">
      The creator never touches the game server. It saves to this site's database, and the server pulls quests
      from there when an admin asks it to.
    </p>
    <ol class="mt-8 grid gap-4 md:grid-cols-3">
      <li v-for="(step, i) in CREATOR_STEPS" :key="step.title" class="card flex flex-col p-5">
        <span class="mb-3 flex items-center gap-2" aria-hidden="true">
          <span class="grid size-8 place-items-center rounded-md border border-gold-400/50 bg-gold-900/60 font-display text-sm text-gold-300">{{ i + 1 }}</span>
          <PixelIcon :name="STEP_ICONS[i] ?? 'star'" :size="20" coloured />
        </span>
        <h3 class="font-semibold text-night-100">{{ step.title }}</h3>
        <code v-if="step.command" class="mt-2 self-start rounded bg-night-800 px-1.5 py-0.5 text-sm break-all text-gold-300">{{ step.command }}</code>
        <p class="mt-2 text-sm text-night-300">{{ step.text }}</p>
      </li>
    </ol>
    <div class="mt-8">
      <RouterLink to="/create" class="inline-block rounded-xl bg-gold-400 px-5 py-3 font-semibold text-night-950 transition hover:bg-gold-300">Open the creator</RouterLink>
    </div>
  </section>
</template>
