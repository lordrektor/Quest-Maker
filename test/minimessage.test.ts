import { describe, expect, it } from 'vitest'
import { contrast, escapeMiniMessage, gradientColor, plainText, readableOn, renderMiniMessage } from '../src/minimessage'

describe('colours', () => {
  it('renders plain text as one segment', () => {
    expect(renderMiniMessage('Zombie Hunt')).toEqual([{ text: 'Zombie Hunt' }])
    expect(renderMiniMessage('')).toEqual([])
  })

  it('knows the 16 named colours and the grey spellings', () => {
    expect(renderMiniMessage('<gold>Zombie Hunt')).toEqual([{ text: 'Zombie Hunt', color: '#ffaa00' }])
    expect(renderMiniMessage('<dark_aqua>a')[0]?.color).toBe('#00aaaa')
    expect(renderMiniMessage('<grey>a')[0]?.color).toBe('#aaaaaa')
    expect(renderMiniMessage('<dark_grey>a')[0]?.color).toBe('#555555')
    expect(renderMiniMessage('<light_purple>a')[0]?.color).toBe('#ff55ff')
  })

  it('takes hex colours and the color tag', () => {
    expect(renderMiniMessage('<#FF0000>red')).toEqual([{ text: 'red', color: '#ff0000' }])
    expect(renderMiniMessage('<color:#00ff00>g</color>')).toEqual([{ text: 'g', color: '#00ff00' }])
    expect(renderMiniMessage('<colour:aqua>a')).toEqual([{ text: 'a', color: '#55ffff' }])
    expect(renderMiniMessage('<c:red>r')).toEqual([{ text: 'r', color: '#ff5555' }])
  })

  it('switches colour and closes back to the outer one', () => {
    expect(renderMiniMessage('<gray>Bring <aqua>8</aqua> iron')).toEqual([
      { text: 'Bring ', color: '#aaaaaa' },
      { text: '8', color: '#55ffff' },
      { text: ' iron', color: '#aaaaaa' },
    ])
  })
})

describe('decorations', () => {
  it('supports every decoration and its short names', () => {
    expect(renderMiniMessage('<bold>a')).toEqual([{ text: 'a', bold: true }])
    expect(renderMiniMessage('<b>a')).toEqual([{ text: 'a', bold: true }])
    expect(renderMiniMessage('<i>a</i><em>b')).toEqual([{ text: 'ab', italic: true }])
    expect(renderMiniMessage('<u>a')).toEqual([{ text: 'a', underlined: true }])
    expect(renderMiniMessage('<st>a')).toEqual([{ text: 'a', strikethrough: true }])
    expect(renderMiniMessage('<obf>a')).toEqual([{ text: 'a', obfuscated: true }])
  })

  it('stacks decorations with colours', () => {
    expect(renderMiniMessage('<gray><italic>Every journey')).toEqual([{ text: 'Every journey', color: '#aaaaaa', italic: true }])
  })

  it('turns a decoration off with ! or :false', () => {
    expect(renderMiniMessage('<bold>a<!bold>b')).toEqual([{ text: 'a', bold: true }, { text: 'b' }])
    expect(renderMiniMessage('<italic>a<italic:false>b')).toEqual([{ text: 'a', italic: true }, { text: 'b' }])
  })

  it('closes a tag and everything opened after it', () => {
    expect(renderMiniMessage('<red>a<bold>b</red>c')).toEqual([
      { text: 'a', color: '#ff5555' },
      { text: 'b', color: '#ff5555', bold: true },
      { text: 'c' },
    ])
    expect(renderMiniMessage('<bold>a</b>b')).toEqual([{ text: 'a', bold: true }, { text: 'b' }])
  })

  it('ignores a closing tag that closes nothing', () => {
    expect(renderMiniMessage('a</red>b')).toEqual([{ text: 'ab' }])
  })
})

describe('reset and line breaks', () => {
  it('resets every style', () => {
    expect(renderMiniMessage('<red><bold>a<reset>b')).toEqual([{ text: 'a', color: '#ff5555', bold: true }, { text: 'b' }])
  })

  it('breaks lines with newline, br and real line breaks', () => {
    expect(renderMiniMessage('a<newline>b<br>c\nd').map((s) => s.text)).toEqual(['a', '\n', 'b', '\n', 'c', '\n', 'd'])
    expect(renderMiniMessage('<red>a<newline>b')).toEqual([{ text: 'a', color: '#ff5555' }, { text: '\n' }, { text: 'b', color: '#ff5555' }])
  })
})

describe('gradients', () => {
  it('interpolates per character', () => {
    const segments = renderMiniMessage('<gradient:#000000:#ffffff>abc</gradient>')
    expect(segments).toEqual([
      { text: 'a', color: '#000000' },
      { text: 'b', color: '#808080' },
      { text: 'c', color: '#ffffff' },
    ])
  })

  it('runs through more than two colours', () => {
    expect(gradientColor(['#ff0000', '#00ff00', '#0000ff'], 0, 5)).toBe('#ff0000')
    expect(gradientColor(['#ff0000', '#00ff00', '#0000ff'], 2, 5)).toBe('#00ff00')
    expect(gradientColor(['#ff0000', '#00ff00', '#0000ff'], 4, 5)).toBe('#0000ff')
  })

  it('renders the Cinder Hydra and keeps the text', () => {
    const segments = renderMiniMessage('<gradient:#3a2a24:#ff7a1c>The Cinder Hydra</gradient>')
    expect(segments.map((s) => s.text).join('')).toBe('The Cinder Hydra')
    expect(segments[0]?.color).toBe('#3a2a24')
    expect(segments[segments.length - 1]?.color).toBe('#ff7a1c')
  })

  it('takes named colours, ignores a phase and lets decorations through', () => {
    const segments = renderMiniMessage('<gradient:red:blue:0.5><bold>ab</bold></gradient>c')
    expect(segments).toEqual([
      { text: 'a', color: '#ff5555', bold: true },
      { text: 'b', color: '#5555ff', bold: true },
      { text: 'c' },
    ])
  })

  it('does not paint text that has its own colour', () => {
    const segments = renderMiniMessage('<gradient:#000000:#ffffff>a<red>XX</red>b</gradient>')
    expect(segments).toEqual([
      { text: 'a', color: '#000000' },
      { text: 'XX', color: '#ff5555' },
      { text: 'b', color: '#ffffff' },
    ])
  })

  it('paints rainbows', () => {
    const segments = renderMiniMessage('<rainbow>abc')
    expect(segments.map((s) => s.color)).toEqual(['#ff0000', '#00ff00', '#0000ff'])
  })
})

describe('escaping and unknown tags', () => {
  it('shows escaped tags as text', () => {
    expect(plainText('\\<red> is a tag')).toBe('<red> is a tag')
    expect(plainText(escapeMiniMessage('a <b> c \\ d'))).toBe('a <b> c \\ d')
  })

  it('drops unknown tags and keeps their text', () => {
    expect(plainText("<hover:show_text:'<red>hi'>Hover me</hover>")).toBe('Hover me')
    expect(plainText('<prefix>Hello <player>')).toBe('Hello ')
    expect(plainText('<lang:item.minecraft.diamond>')).toBe('')
  })

  it('keeps text that is not a tag', () => {
    expect(plainText('a < b and c > d')).toBe('a < b and c > d')
    expect(plainText('I <3 you')).toBe('I <3 you')
    expect(plainText('<red unclosed')).toBe('<red unclosed')
  })

  it('never turns input into markup', () => {
    const segments = renderMiniMessage('<red><script>alert(1)</script><img src=x onerror=alert(1)>')
    // <script> is an unknown tag (dropped); the img is not a tag at all (a space in the name), so it stays text
    expect(segments.map((s) => s.text).join('')).toBe('alert(1)<img src=x onerror=alert(1)>')
    expect(segments.every((s) => Object.keys(s).every((k) => ['text', 'color'].includes(k)))).toBe(true)
    expect(plainText('<b>&lt;</b>')).toBe('&lt;')
  })
})

describe('placeholders', () => {
  it('replaces placeholder tags with plain text in the current style', () => {
    const line = '<status> Slay <required> blazes <aqua><current>/<required>'
    const segments = renderMiniMessage(line, { placeholders: { status: '•', current: '0', required: '5' } })
    expect(segments).toEqual([{ text: '• Slay 5 blazes ' }, { text: '0/5', color: '#55ffff' }])
  })

  it('never parses a placeholder value', () => {
    expect(plainText('<id>', { placeholders: { id: '<red>x' } })).toBe('<red>x')
  })
})

describe('readable colours', () => {
  it('lifts dark colours on a dark background and keeps light ones', () => {
    const bg = '#11141a'
    expect(readableOn('#ffaa00', bg)).toBe('#ffaa00')
    const lifted = readableOn('#0000aa', bg)
    expect(lifted).not.toBe('#0000aa')
    expect(contrast(lifted, bg)).toBeGreaterThanOrEqual(4.5)
  })
})
