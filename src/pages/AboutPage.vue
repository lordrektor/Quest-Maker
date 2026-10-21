<script setup lang="ts">
/** Who LordRektor is: the creator of Chronos (and Tyche). The text follows the Tyche showcase's page about them. */
import ChronosLogo from '../components/ChronosLogo.vue'
import PixelIcon from '../components/PixelIcon.vue'
import { usePageTitle } from '../title'

usePageTitle(() => 'LordRektor')

const roles = [
  {
    icon: 'laptop',
    title: 'Software Engineer',
    tag: '13 years',
    text: 'Thirteen years of designing, building and maintaining software that has to keep running: clean architecture, readable code, and the patience to debug what nobody else wants to touch.',
  },
  {
    icon: 'columns',
    title: 'Solution Architect',
    tag: 'the big picture',
    text: 'Turns a goal into a solution that fits together: which plugins own what, how they talk to each other, and where the boundaries sit, so each part can grow without breaking the rest.',
  },
  {
    icon: 'workspace',
    title: 'System Designer',
    tag: 'rules that compose',
    text: 'Designs systems out of small parts that combine: a Chronos quest is stages of objectives, requirements and rewards picked from a catalog of types, so a new quest is a new combination, not new code.',
  },
  {
    icon: 'cloud',
    title: 'Cloud Engineer',
    tag: 'deploy & scale',
    text: 'Takes software from a machine to the world: hosting, deployment pipelines, caching and keeping services fast and available as they grow.',
  },
  {
    icon: 'loop',
    title: 'DevOps',
    tag: 'build, ship, run',
    text: 'Automates the loop from code to running service: builds, checks, deployments and monitoring, so shipping is one command and a bad change is caught before players see it.',
  },
  {
    icon: 'gamepad',
    title: 'Game Developer',
    tag: 'Minecraft servers',
    text: 'Builds the systems players feel without seeing: quests and progression, bosses that think, loot that feels fair, spawners and mob AI, all running on a live server at 20 ticks a second.',
  },
  {
    icon: 'globe',
    title: 'Network Engineer',
    tag: 'packets & servers',
    text: 'Knows what happens between the server and the player: packets, latency, threads and regions. It is why Chronos is built for Folia and why several servers can share one quest database.',
  },
  {
    icon: 'message',
    title: 'Prompt Engineer',
    tag: 'precise instructions',
    text: 'Turns intent into instructions a model can follow: clear rules, the right context, and corrections that become rules, so the result is the same every time, not just once.',
  },
  {
    icon: 'chip',
    title: 'AI Developer',
    tag: 'pipelines & tools',
    text: 'Designs pipelines where AI does the legwork: research turned into rules, rules into scripts and code, every result reviewed, checked and, when needed, fixed by hand.',
  },
]

const chapters = [
  {
    kicker: 'Chapter 1',
    title: 'Thirteen years of shipping software',
    text: [
      'LordRektor’s story starts the way most engineering stories do: with code that had to work. Thirteen years of it. Systems that other people depended on, bugs that only showed up on a Friday, and the slow lesson that good software is less about clever tricks and more about being clear, careful and consistent.',
      'Those years built the habits that show up in everything since: read the source before trusting the docs, measure before optimising, and leave the code easier to read than you found it.',
      'Over time the work moved up a level: from writing the code to architecting the solution and designing the system around it, and from a single machine to services built, deployed and monitored automatically in the cloud.',
    ],
  },
  {
    kicker: 'Chapter 2',
    title: 'The network underneath',
    text: [
      'Software never runs alone. Working on networks meant learning what sits between a server and its users: packets, timing, threads, and the many ways a connection can quietly go wrong.',
      'That knowledge pays off in game servers, where a single bad packet can disconnect a player. Tyche carries a guard for exactly that: when a model plugin sent the wrong kind of entity data, Tyche caught it at the packet level before it reached anyone.',
    ],
  },
  {
    kicker: 'Chapter 3',
    title: 'Games: the hardest client of all',
    text: [
      'Games are software with an audience that notices everything. A boss that hits a frame late feels unfair; a drop table that is slightly off feels like a scam. Game development became the place where engineering and feel had to meet.',
      'Minecraft servers turned that into a long-running craft: custom loot, spawners, mob AI, progression with ExperienceTailor, bosses scripted as a brain loop of conditions and actions, and quests that tie it all together.',
    ],
  },
  {
    kicker: 'Chapter 4',
    title: 'Learning to direct machines',
    text: [
      'When AI tools arrived, LordRektor treated them like any other system: something to understand, instruct precisely and verify. Prompting became engineering. Vague requests became rules; every correction became a rule too.',
      'The AI researches and writes code and scripts; LordRektor sets the direction, reviews the work, changes it by hand when needed and verifies the result. The AI assists. The decisions stay human.',
    ],
  },
  {
    kicker: 'Chapter 5',
    title: 'Chronos',
    text: [
      'All of it comes together in Chronos: a quest plugin that runs quests in stages, gates them with requirements, pays out rewards, fails them by rule and chains them into storylines, on one server or a whole network. Designed and directed by LordRektor, with AI as an assistant.',
      'The quests on this site are what Chronos makes possible: story chapters, daily rotations and boss hunts built from Tyche, Vulcan, ExperienceTailor, Chrysos, Kleos, Crius, Metabasis, RpgInv and Convo, in game, in YAML or on the web canvas.',
    ],
  },
]

const numbers = [{ n: '13', label: 'years of software engineering' }]

const principles = [
  { t: 'Read the source', d: 'Trust the code over the comments, and measure before guessing.' },
  { t: 'Rules over one-offs', d: 'Every correction becomes a rule, so the same mistake never comes back.' },
  { t: 'Readable for the player', d: 'If a player cannot read a quest, it is not hard: it is unfair.' },
  { t: 'Use the whole machine', d: 'Independent work runs on every CPU core, never one.' },
  { t: 'Humans decide', d: 'AI assists with the work; reviewing, verifying and deciding stay human.' },
]

const ROLE_CHIP = 'inline-flex items-center gap-1.5 rounded-full border border-gold-500/50 bg-night-850 px-2.5 py-1 text-xs text-night-100'
</script>

<template>
  <!-- Hero -->
  <section class="pb-12 sm:pb-16" aria-labelledby="about-title">
    <div class="grid items-center gap-10 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <p class="eyebrow mb-3">About the creator</p>
        <h1 id="about-title" class="text-4xl leading-tight font-bold tracking-tight text-night-100 sm:text-6xl">
          Who is <span class="bg-linear-to-r from-gold-300 to-emerald-300 bg-clip-text text-transparent">LordRektor</span>?
        </h1>
        <p class="mt-6 max-w-2xl text-lg leading-relaxed text-night-300">
          A software engineer with thirteen years behind the keyboard, who architects solutions, designs systems that compose,
          builds game systems, ships and runs them from the network up to the cloud, and directs AI the way a lead directs a team: clear rules,
          careful review, final say. LordRektor is the creator of <b class="text-night-100">Chronos</b> and <b class="text-night-100">Tyche</b>.
        </p>
        <ul class="mt-6 flex flex-wrap gap-2" aria-label="Crafts">
          <li v-for="r in roles" :key="r.title" :class="ROLE_CHIP"><PixelIcon :name="r.icon" :size="14" class="text-gold-400" /> {{ r.title }}</li>
        </ul>
      </div>
      <div class="relative mx-auto w-full max-w-sm">
        <div aria-hidden="true" class="absolute -inset-6 rounded-[3rem] bg-linear-to-br from-gold-500/25 via-transparent to-emerald-400/20 blur-3xl" />
        <div class="card relative overflow-hidden p-8 text-center">
          <div class="mx-auto grid size-28 place-items-center rounded-3xl border border-gold-500/40 bg-night-850 shadow-[0_0_60px_-10px] shadow-gold-500/60">
            <ChronosLogo :size="84" />
          </div>
          <p class="mt-5 font-display text-3xl text-night-100">LordRektor</p>
          <p class="mt-1 font-mono text-xs tracking-[0.2em] text-gold-400 uppercase">Creator of Chronos</p>
          <dl class="mt-6 grid grid-cols-1 gap-3">
            <div v-for="n in numbers" :key="n.label" class="rounded-xl border border-night-700 bg-night-850 px-2 py-3">
              <dt class="text-[10px] leading-tight tracking-wider text-night-400 uppercase">{{ n.label }}</dt>
              <dd class="order-first font-display text-3xl text-gold-300">{{ n.n }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </section>

  <!-- Roles -->
  <section class="border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="roles-title">
    <p class="eyebrow mb-3">What LordRektor does</p>
    <h2 id="roles-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">Nine crafts, one engineer</h2>
    <div class="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <article v-for="r in roles" :key="r.title" class="card card-link flex flex-col p-6">
        <div class="flex items-center justify-between gap-3">
          <PixelIcon :name="r.icon" :size="34" class="text-gold-400" />
          <span class="rounded-full border border-night-600 px-2 py-0.5 text-[11px] text-night-300">{{ r.tag }}</span>
        </div>
        <h3 class="mt-4 text-xl font-semibold text-night-100">{{ r.title }}</h3>
        <p class="mt-2 text-sm leading-relaxed text-night-400">{{ r.text }}</p>
      </article>
      <article class="card flex flex-col justify-center border-dashed p-6 text-center">
        <p class="font-display text-2xl text-gold-300">All of them at once</p>
        <p class="mt-2 text-sm text-night-400">Chronos needed every one: architecture and system design for its building blocks, engineering for the plugin, the network for Folia and shared databases, DevOps and the cloud for this site, games for the feel, and prompts and AI for the tools.</p>
      </article>
    </div>
  </section>

  <!-- Back story -->
  <section class="border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="story-title">
    <p class="eyebrow mb-3">The back story</p>
    <h2 id="story-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">From code that had to work to quests that tell a story</h2>
    <ol class="relative mt-10 space-y-10 border-l border-night-700 pl-6 sm:pl-10">
      <li v-for="(c, i) in chapters" :key="c.title" class="relative">
        <span aria-hidden="true" class="absolute top-1 -left-[2.05rem] grid size-8 place-items-center rounded-full border border-gold-500/60 bg-night-900 font-mono text-xs text-gold-300 sm:-left-[3.05rem]">{{ i + 1 }}</span>
        <p class="font-mono text-xs tracking-[0.2em] text-emerald-300 uppercase">{{ c.kicker }}</p>
        <h3 class="mt-1 text-2xl font-semibold text-night-100 sm:text-3xl">{{ c.title }}</h3>
        <p v-for="(p, pi) in c.text" :key="pi" class="mt-3 max-w-3xl leading-relaxed text-night-300">{{ p }}</p>
      </li>
    </ol>
  </section>

  <!-- Principles -->
  <section class="border-t border-night-800/80 py-12 sm:py-16" aria-labelledby="principles-title">
    <p class="eyebrow mb-3">How LordRektor works</p>
    <h2 id="principles-title" class="text-2xl leading-tight font-bold tracking-tight text-night-100 sm:text-3xl">Principles</h2>
    <div class="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <div v-for="p in principles" :key="p.t" class="card p-5">
        <p class="font-semibold text-gold-300">{{ p.t }}</p>
        <p class="mt-2 text-sm leading-relaxed text-night-400">{{ p.d }}</p>
      </div>
    </div>
  </section>

  <!-- Call to action -->
  <section class="border-t border-night-800/80 pt-12 sm:pt-16" aria-labelledby="work-title">
    <div class="card flex flex-col gap-6 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <h2 id="work-title" class="text-2xl font-bold text-night-100 sm:text-3xl">See the work</h2>
        <p class="mt-2 max-w-2xl text-night-400">What Chronos can do, and the canvas that builds its quests.</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <RouterLink to="/" class="rounded-xl bg-gold-400 px-5 py-3 font-semibold text-night-950 transition hover:bg-gold-300">The showcase →</RouterLink>
        <RouterLink to="/create" class="rounded-xl border border-night-600 px-5 py-3 font-semibold text-night-100 hover:border-gold-400">The creator</RouterLink>
      </div>
    </div>
  </section>
</template>
