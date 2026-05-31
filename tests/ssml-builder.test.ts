import { describe, it, expect } from 'vitest'
import { buildSsml, splitIntoBatches } from '../lib/ssml-builder.js'
import type { SlideNote } from '../lib/ssml-builder.js'

// ── buildSsml ───────────────────────────────────────────────────────────────

describe('buildSsml', () => {
  it('wraps output in <speak> tags', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['Hello'] }])
    expect(ssml).toMatch(/^<speak>/)
    expect(ssml).toMatch(/<\/speak>$/)
  })

  it('inserts slide start mark and text for a single slide', () => {
    const { ssml } = buildSsml([{ page: 3, sections: ['Hello world'] }])
    expect(ssml).toContain('<mark name="slide_3"/>')
    expect(ssml).toContain('Hello world')
  })

  it('inserts click marks for additional sections', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['intro', 'detail', 'outro'] }])
    expect(ssml).toContain('<mark name="slide_1"/>')
    expect(ssml).toContain('<mark name="slide_1_click_1"/>')
    expect(ssml).toContain('<mark name="slide_1_click_2"/>')
    expect(ssml).not.toContain('<mark name="slide_1_click_3"/>')
  })

  it('inserts a break between slides with the given breakTime', () => {
    const slides: SlideNote[] = [
      { page: 1, sections: ['first'] },
      { page: 2, sections: ['second'] },
    ]
    const { ssml } = buildSsml(slides, '750ms')
    expect(ssml).toContain('<break time="750ms"/>')
  })

  it('does NOT insert a break before the first slide in a batch', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['only'] }], '500ms')
    expect(ssml).not.toContain('<break')
  })

  it('uses 500ms as default breakTime', () => {
    const slides: SlideNote[] = [
      { page: 1, sections: ['a'] },
      { page: 2, sections: ['b'] },
    ]
    const { ssml } = buildSsml(slides)
    expect(ssml).toContain('<break time="500ms"/>')
  })

  it('escapes XML special characters in text', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['<b> & "quotes"'] }])
    expect(ssml).toContain('&lt;b&gt; &amp; &quot;quotes&quot;')
    expect(ssml).not.toContain('<b>')
  })

  it('applies dictionary substitutions with <sub> tags', () => {
    const { ssml } = buildSsml([
      {
        page: 1,
        sections: ['Doctrine の ORM は DataMapper です。'],
        dictionary: [
          { from: 'Doctrine', to: 'ドクトリン' },
          { from: 'ORM', to: 'オーアールエム' },
          { from: 'DataMapper', to: 'データマッパー' },
        ],
      },
    ])

    expect(ssml).toContain('<sub alias="ドクトリン">Doctrine</sub>')
    expect(ssml).toContain('<sub alias="オーアールエム">ORM</sub>')
    expect(ssml).toContain('<sub alias="データマッパー">DataMapper</sub>')
  })

  it('merges global and slide dictionaries with slide entries overriding global entries', () => {
    const slides: SlideNote[] = [
      {
        page: 1,
        sections: ['Doctrine と Laravel'],
        dictionary: [{ from: 'Doctrine', to: 'ドクトリン' }],
      },
    ]
    const globalDictionary = [{ from: 'Doctrine', to: 'ドクトリン(グローバル)' }, { from: 'Laravel', to: 'ララベル' }]

    const { ssml } = buildSsml(slides, '500ms', globalDictionary)

    expect(ssml).toContain('<sub alias="ドクトリン">Doctrine</sub>')
    expect(ssml).toContain('<sub alias="ララベル">Laravel</sub>')
    expect(ssml).not.toContain('ドクトリン(グローバル)')
  })

  it('returns the list of page numbers included in the batch', () => {
    const slides: SlideNote[] = [
      { page: 2, sections: ['a'] },
      { page: 5, sections: ['b'] },
    ]
    const { pages } = buildSsml(slides)
    expect(pages).toEqual([2, 5])
  })

  it('handles a slide with only one section (no clicks)', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['only section'] }])
    expect(ssml).not.toContain('_click_')
    expect(ssml).toContain('only section')
  })

  it('disables global dictionary when disableGlobalDict is true', () => {
    const slides: SlideNote[] = [
      {
        page: 1,
        sections: ['Doctrine と Laravel'],
        disableGlobalDict: true,
      },
    ]
    const globalDictionary = [{ from: 'Doctrine', to: 'ドクトリン' }, { from: 'Laravel', to: 'ララベル' }]

    const { ssml } = buildSsml(slides, '500ms', globalDictionary)

    // Global dictionary should NOT be applied
    expect(ssml).toContain('Doctrine')
    expect(ssml).toContain('Laravel')
    expect(ssml).not.toContain('<sub alias="ドクトリン">Doctrine</sub>')
    expect(ssml).not.toContain('<sub alias="ララベル">Laravel</sub>')
  })

  it('disables global dictionary but applies slide-specific dictionary when disableGlobalDict is true with slide dictionary', () => {
    const slides: SlideNote[] = [
      {
        page: 1,
        sections: ['Doctrine と Laravel'],
        dictionary: [{ from: 'Doctrine', to: 'ドクトリン' }],
        disableGlobalDict: true,
      },
    ]
    const globalDictionary = [{ from: 'Laravel', to: 'ララベル(グローバル)' }]

    const { ssml } = buildSsml(slides, '500ms', globalDictionary)

    // Slide-specific dictionary should be applied
    expect(ssml).toContain('<sub alias="ドクトリン">Doctrine</sub>')
    // Global dictionary should NOT be applied
    expect(ssml).toContain('Laravel')
    expect(ssml).not.toContain('ララベル')
  })

  it('does not insert a break at click boundaries (no audio gap on seek)', () => {
    const { ssml } = buildSsml([{ page: 1, sections: ['a', 'b'] }])
    // break must not appear between the slide mark and click mark
    const clickIdx = ssml.indexOf('<mark name="slide_1_click_1"/>')
    const breakIdx = ssml.indexOf('<break')
    // either no break at all, or break comes before the slide mark
    expect(breakIdx === -1 || breakIdx < ssml.indexOf('<mark name="slide_1"/>')).toBe(true)
    expect(clickIdx).toBeGreaterThan(-1)
  })
})

// ── splitIntoBatches ────────────────────────────────────────────────────────

describe('splitIntoBatches', () => {
  it('returns an empty array for empty input', () => {
    expect(splitIntoBatches([])).toEqual([])
  })

  it('puts all slides in one batch when they fit', () => {
    const slides: SlideNote[] = [
      { page: 1, sections: ['short'] },
      { page: 2, sections: ['also short'] },
    ]
    const batches = splitIntoBatches(slides)
    expect(batches).toHaveLength(1)
    expect(batches[0].pages).toEqual([1, 2])
  })

  it('splits into multiple batches when maxBytes is exceeded', () => {
    // Each slide's SSML is roughly 50+ bytes, so with maxBytes=80 each goes in its own batch
    const slides: SlideNote[] = [
      { page: 1, sections: ['first slide content that is somewhat long'] },
      { page: 2, sections: ['second slide content that is somewhat long'] },
      { page: 3, sections: ['third slide content that is somewhat long'] },
    ]
    const batches = splitIntoBatches(slides, '500ms', 80)
    expect(batches.length).toBeGreaterThan(1)
    // every slide must appear in exactly one batch
    const allPages = batches.flatMap(b => b.pages).sort((a, b) => a - b)
    expect(allPages).toEqual([1, 2, 3])
  })

  it('never splits a single slide across batches even if it exceeds maxBytes', () => {
    const longText = 'a'.repeat(5000)
    const slides: SlideNote[] = [{ page: 1, sections: [longText] }]
    const batches = splitIntoBatches(slides, '500ms', 100)
    expect(batches).toHaveLength(1)
    expect(batches[0].pages).toEqual([1])
  })

  it('each batch produces valid SSML', () => {
    const slides: SlideNote[] = Array.from({ length: 5 }, (_, i) => ({
      page: i + 1,
      sections: ['text ' + i],
    }))
    const batches = splitIntoBatches(slides, '500ms', 200)
    for (const batch of batches) {
      expect(batch.ssml).toMatch(/^<speak>/)
      expect(batch.ssml).toMatch(/<\/speak>$/)
    }
  })
})
