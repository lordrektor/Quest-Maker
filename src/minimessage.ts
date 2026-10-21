/**
 * A small MiniMessage renderer for the showcase: colours, hex colours, decorations, gradients, rainbows, resets,
 * line breaks and closing tags. It never produces HTML: it returns styled text segments that a Vue component turns
 * into elements, so anything a quest author writes is shown as text.
 *
 * Unknown tags (hover, click, font, lang, `<player>` without a placeholder value, ...) are dropped; the text inside
 * them is kept. Text that only looks like a tag (`a < b`, an unclosed `<`) is shown as written.
 */

export interface Style {
  /** `#rrggbb`, lower case. */
  color?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
}

/** A run of text with one style. A segment whose text is `\n` is a line break. */
export interface Segment extends Style {
  text: string
}

export interface RenderOptions {
  /**
   * Tag name (lower case, without `<>`) to the text it stands for, e.g. `{ required: '20' }` for `<required>`.
   * The value is inserted as plain text in the surrounding style; it is never parsed as MiniMessage.
   */
  placeholders?: Record<string, string>
}

/** The 16 Minecraft chat colours (and the `grey` spellings). */
export const NAMED_COLORS: Readonly<Record<string, string>> = {
  black: '#000000',
  dark_blue: '#0000aa',
  dark_green: '#00aa00',
  dark_aqua: '#00aaaa',
  dark_red: '#aa0000',
  dark_purple: '#aa00aa',
  gold: '#ffaa00',
  gray: '#aaaaaa',
  grey: '#aaaaaa',
  dark_gray: '#555555',
  dark_grey: '#555555',
  blue: '#5555ff',
  green: '#55ff55',
  aqua: '#55ffff',
  red: '#ff5555',
  light_purple: '#ff55ff',
  yellow: '#ffff55',
  white: '#ffffff',
}

const DECORATIONS: Readonly<Record<string, keyof Omit<Style, 'color'>>> = {
  bold: 'bold',
  b: 'bold',
  italic: 'italic',
  i: 'italic',
  em: 'italic',
  underlined: 'underlined',
  u: 'underlined',
  strikethrough: 'strikethrough',
  st: 'strikethrough',
  obfuscated: 'obfuscated',
  obf: 'obfuscated',
}

const COLOR_TAGS = new Set(['color', 'colour', 'c'])
const LINE_BREAKS = new Set(['newline', 'br'])

// =========================================================================
// COLOURS
// =========================================================================

/** {@return a colour name or `#rrggbb` as `#rrggbb`, or null} */
export function parseColor(value: string): string | null {
  const v = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  return NAMED_COLORS[v] ?? null
}

function toRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (c: number) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = toRgb(a)
  const [br, bg, bb] = toRgb(b)
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t])
}

/** {@return the colour at character `index` of `length` along a gradient through `colors`} */
export function gradientColor(colors: readonly string[], index: number, length: number): string {
  const first = colors[0] ?? '#ffffff'
  if (colors.length < 2 || length <= 1) return first
  const scaled = (index / (length - 1)) * (colors.length - 1)
  const k = Math.min(Math.floor(scaled), colors.length - 2)
  return mix(colors[k] ?? first, colors[k + 1] ?? first, scaled - k)
}

function hsv(hue: number): string {
  const h = ((hue % 360) + 360) % 360 / 60
  const x = 1 - Math.abs((h % 2) - 1)
  const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x]
  return toHex([r * 255, g * 255, b * 255])
}

function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** {@return the WCAG contrast ratio of two `#rrggbb` colours} */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * {@return the colour, lightened toward white until it reaches `ratio` contrast on `background`} Minecraft's dark
 * colours (black, dark_blue, a gradient's dark end) were made for the game's light-on-dark tooltips; on a dark page
 * they need a lift to stay readable.
 */
export function readableOn(color: string, background: string, ratio = 4.5): string {
  if (contrast(color, background) >= ratio) return color
  for (let t = 0.1; t < 1; t += 0.1) {
    const lifted = mix(color, '#ffffff', t)
    if (contrast(lifted, background) >= ratio) return lifted
  }
  return '#ffffff'
}

// =========================================================================
// TOKENS
// =========================================================================

type Token =
  | { kind: 'text'; text: string }
  | { kind: 'open'; name: string; args: string[] }
  | { kind: 'close'; name: string }

const TAG_NAME = /^[!?]?[a-z0-9_#-]+$/

/** Splits a tag's inside at `:` that are not inside quotes, and unquotes the parts. */
function splitArgs(inside: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (let i = 0; i < inside.length; i++) {
    const ch = inside[i] as string
    if (quote) {
      if (ch === '\\' && inside[i + 1] === quote) {
        current += quote
        i++
      } else if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
    } else if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === ':') {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts
}

/** {@return the index of the `>` that ends the tag starting at `start`, or -1} */
function tagEnd(input: string, start: number): number {
  let quote: string | null = null
  for (let i = start + 1; i < input.length; i++) {
    const ch = input[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = null
    } else if (ch === "'" || ch === '"') {
      quote = ch
    } else if (ch === '>') {
      return i
    } else if (ch === '<' || ch === '\n') {
      return -1
    }
  }
  return -1
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let text = ''
  const flush = () => {
    if (text) tokens.push({ kind: 'text', text })
    text = ''
  }
  for (let i = 0; i < input.length; i++) {
    const ch = input[i] as string
    if (ch === '\\' && (input[i + 1] === '<' || input[i + 1] === '\\')) {
      text += input[i + 1]
      i++
      continue
    }
    if (ch !== '<') {
      text += ch
      continue
    }
    const end = tagEnd(input, i)
    const inside = end < 0 ? '' : input.slice(i + 1, end)
    const closing = inside.startsWith('/')
    const parts = splitArgs(closing ? inside.slice(1) : inside)
    const name = (parts[0] ?? '').toLowerCase()
    if (end < 0 || !TAG_NAME.test(name)) {
      text += ch
      continue
    }
    flush()
    tokens.push(closing ? { kind: 'close', name } : { kind: 'open', name, args: parts.slice(1) })
    i = end
  }
  flush()
  return tokens
}

// =========================================================================
// TREE
// =========================================================================

type Effect =
  | { kind: 'color'; color: string }
  | { kind: 'decoration'; key: keyof Omit<Style, 'color'>; value: boolean }
  | { kind: 'gradient'; colors: string[] }
  | { kind: 'rainbow'; reverse: boolean; phase: number }

type Node = { kind: 'text'; text: string } | { kind: 'element'; name: string; effect: Effect | null; children: Node[] }

/** {@return what an opening tag does, or null for a tag this renderer does not know} */
function effectOf(rawName: string, args: string[]): { name: string; effect: Effect } | null {
  const negated = rawName.startsWith('!')
  const name = negated ? rawName.slice(1) : rawName
  const decoration = DECORATIONS[name]
  if (decoration) {
    const value = !negated && (args[0] ?? 'true').toLowerCase() !== 'false'
    return { name, effect: { kind: 'decoration', key: decoration, value } }
  }
  if (negated) return null
  const named = parseColor(name)
  if (named) return { name, effect: { kind: 'color', color: named } }
  if (COLOR_TAGS.has(name)) {
    const color = parseColor(args[0] ?? '')
    return color ? { name: 'color', effect: { kind: 'color', color } } : null
  }
  if (name === 'gradient' || name === 'transition') {
    const colors = args.map(parseColor).filter((c): c is string => c !== null)
    if (colors.length === 0) colors.push('#ffffff', '#000000')
    // A transition shows one colour for the whole text; its phase is not shown, so the first colour stands
    return { name, effect: name === 'gradient' ? { kind: 'gradient', colors } : { kind: 'color', color: colors[0] as string } }
  }
  if (name === 'rainbow') {
    const arg = args[0] ?? ''
    const reverse = arg.startsWith('!')
    const phase = Number.parseFloat(reverse ? arg.slice(1) : arg)
    return { name, effect: { kind: 'rainbow', reverse, phase: Number.isFinite(phase) ? phase : 0 } }
  }
  return null
}

function closes(open: string, close: string): boolean {
  if (open === close) return true
  if (COLOR_TAGS.has(close)) return open === 'color' || parseColor(open) !== null
  const a = DECORATIONS[open]
  return a !== undefined && a === DECORATIONS[close]
}

function parse(input: string, placeholders: Record<string, string>): Node[] {
  const root: Node & { kind: 'element' } = { kind: 'element', name: '', effect: null, children: [] }
  const stack: (Node & { kind: 'element' })[] = [root]
  const top = () => stack[stack.length - 1] as Node & { kind: 'element' }
  for (const token of tokenize(input.replace(/\r\n?/g, '\n'))) {
    if (token.kind === 'text') {
      top().children.push({ kind: 'text', text: token.text })
    } else if (token.kind === 'open') {
      if (Object.prototype.hasOwnProperty.call(placeholders, token.name)) {
        top().children.push({ kind: 'text', text: placeholders[token.name] ?? '' })
      } else if (LINE_BREAKS.has(token.name)) {
        top().children.push({ kind: 'text', text: '\n' })
      } else if (token.name === 'reset') {
        stack.length = 1
      } else {
        const known = effectOf(token.name, token.args)
        if (known) {
          const element: Node & { kind: 'element' } = { kind: 'element', name: known.name, effect: known.effect, children: [] }
          top().children.push(element)
          stack.push(element)
        }
      }
    } else {
      const name = token.name.startsWith('!') ? token.name.slice(1) : token.name
      for (let i = stack.length - 1; i > 0; i--) {
        if (closes((stack[i] as Node & { kind: 'element' }).name, name)) {
          stack.length = i
          break
        }
      }
    }
  }
  return root.children
}

// =========================================================================
// RENDER
// =========================================================================

interface Painter {
  colorAt(index: number): string
  next: number
}

/** Characters a gradient paints: everything inside it except line breaks and text with its own colour. */
function paintedLength(nodes: Node[]): number {
  let n = 0
  for (const node of nodes) {
    if (node.kind === 'text') n += Array.from(node.text).filter((c) => c !== '\n').length
    else if (!node.effect || node.effect.kind === 'decoration') n += paintedLength(node.children)
  }
  return n
}

function emit(nodes: Node[], style: Style, painter: Painter | null, out: Segment[]) {
  for (const node of nodes) {
    if (node.kind === 'text') {
      if (!node.text) continue
      if (painter) {
        for (const ch of Array.from(node.text)) {
          out.push(ch === '\n' ? { text: '\n' } : { ...style, text: ch, color: painter.colorAt(painter.next++) })
        }
      } else {
        node.text.split('\n').forEach((part, i) => {
          if (i > 0) out.push({ text: '\n' })
          if (part) out.push({ ...style, text: part })
        })
      }
      continue
    }
    const effect = node.effect
    if (!effect) {
      emit(node.children, style, painter, out)
    } else if (effect.kind === 'decoration') {
      emit(node.children, { ...style, [effect.key]: effect.value }, painter, out)
    } else if (effect.kind === 'color') {
      emit(node.children, { ...style, color: effect.color }, null, out)
    } else {
      const length = paintedLength(node.children)
      const colorAt = effect.kind === 'gradient'
        ? (i: number) => gradientColor(effect.colors, i, length)
        : (i: number) => hsv(((effect.reverse ? length - 1 - i : i) / Math.max(1, length) + effect.phase) * 360)
      emit(node.children, style, { colorAt, next: 0 }, out)
    }
  }
}

function sameStyle(a: Segment, b: Segment): boolean {
  return a.color === b.color && !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.underlined === !!b.underlined
    && !!a.strikethrough === !!b.strikethrough && !!a.obfuscated === !!b.obfuscated
}

/** Drops style keys that are unset or false, so segments compare and serialise cleanly. */
function clean(segment: Segment): Segment {
  const out: Segment = { text: segment.text }
  if (segment.text === '\n') return out
  if (segment.color) out.color = segment.color
  for (const key of ['bold', 'italic', 'underlined', 'strikethrough', 'obfuscated'] as const) {
    if (segment[key]) out[key] = true
  }
  return out
}

/**
 * Renders MiniMessage to styled text segments. Adjacent text with the same style is merged; a line break is its own
 * segment with the text `\n`.
 */
export function renderMiniMessage(input: string, options: RenderOptions = {}): Segment[] {
  if (!input) return []
  const raw: Segment[] = []
  emit(parse(String(input), options.placeholders ?? {}), {}, null, raw)
  const merged: Segment[] = []
  for (const segment of raw.map(clean)) {
    const last = merged[merged.length - 1]
    if (last && last.text !== '\n' && segment.text !== '\n' && sameStyle(last, segment)) last.text += segment.text
    else merged.push(segment)
  }
  return merged
}

/** {@return the text without any tags, line breaks as `\n`} */
export function plainText(input: string, options: RenderOptions = {}): string {
  return renderMiniMessage(input, options).map((s) => s.text).join('')
}

/** {@return the text with `\` and `<` escaped, so MiniMessage shows it as written} */
export function escapeMiniMessage(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/</g, '\\<')
}
