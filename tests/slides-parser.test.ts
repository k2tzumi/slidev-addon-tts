import { describe, it, expect } from 'vitest'
import {
  isSlideSpecificFrontmatter,
  extractLastComment,
  maskCodeFenceSeparators,
  parseSlides,
  parseFrontmatterTtsConfigFromString,
} from '../lib/slides-parser.js'

// ── isSlideSpecificFrontmatter ──────────────────────────────────────────────

describe('isSlideSpecificFrontmatter', () => {
  it('returns true for a pure YAML block', () => {
    expect(isSlideSpecificFrontmatter('\nlayout: center\ntransition: fade\n')).toBe(true)
  })

  it('returns false for empty block', () => {
    expect(isSlideSpecificFrontmatter('')).toBe(false)
    expect(isSlideSpecificFrontmatter('   \n  ')).toBe(false)
  })

  it('returns false when block contains an HTML comment (speaker note)', () => {
    expect(isSlideSpecificFrontmatter('<!-- This is a note -->')).toBe(false)
  })

  it('returns false when block contains a Markdown heading', () => {
    expect(isSlideSpecificFrontmatter('# Slide title\n\nSome text')).toBe(false)
  })

  it('returns false when block contains a code fence', () => {
    expect(isSlideSpecificFrontmatter('```js\nconsole.log(1)\n```')).toBe(false)
  })

  it('returns false when block contains an HTML/Vue tag', () => {
    expect(isSlideSpecificFrontmatter('<MyComponent />')).toBe(false)
  })

  it('returns false when block contains a table', () => {
    expect(isSlideSpecificFrontmatter('| col |\n|-----|\n| val |')).toBe(false)
  })
})

// ── extractLastComment ──────────────────────────────────────────────────────

describe('extractLastComment', () => {
  it('returns empty string when no comment present', () => {
    expect(extractLastComment('# Heading\n\nParagraph')).toBe('')
  })

  it('returns the content of a single comment', () => {
    expect(extractLastComment('# Slide\n<!-- speaker note -->')).toBe('speaker note')
  })

  it('returns the LAST comment when multiple exist', () => {
    expect(extractLastComment('<!-- first -->\n\n<!-- second -->')).toBe('second')
  })

  it('ignores comments inside code fences', () => {
    const block = '```\n<!-- inside fence -->\n```\n<!-- outside -->'
    expect(extractLastComment(block)).toBe('outside')
  })

  it('trims whitespace from comment content', () => {
    expect(extractLastComment('<!--  trimmed  -->')).toBe('trimmed')
  })
})

// ── maskCodeFenceSeparators ─────────────────────────────────────────────────

describe('maskCodeFenceSeparators', () => {
  it('does not modify --- outside code fences', () => {
    const md = 'line1\n---\nline2'
    expect(maskCodeFenceSeparators(md)).toBe(md)
  })

  it('replaces --- inside a backtick fence with placeholder', () => {
    const md = '```\n---\n```'
    const result = maskCodeFenceSeparators(md)
    expect(result).not.toContain('\n---\n')
    expect(result).toContain('\x00FENCE_SEP\x00')
  })

  it('replaces --- inside a tilde fence', () => {
    const md = '~~~\n---\n~~~'
    const result = maskCodeFenceSeparators(md)
    expect(result).toContain('\x00FENCE_SEP\x00')
  })

  it('handles --- both inside and outside fences correctly', () => {
    const md = '---\n```\n---\n```\n---'
    const result = maskCodeFenceSeparators(md)
    const lines = result.split('\n')
    // first and last --- are outside the fence → must remain
    expect(lines[0]).toBe('---')
    expect(lines[4]).toBe('---')
    // the middle --- is inside the fence → must be replaced
    expect(lines[2]).toBe('\x00FENCE_SEP\x00')
  })

  it('requires closing fence to have at least as many chars as opening fence', () => {
    // opening ``` closed by ```` — the ```` is longer so it closes the fence
    const md = '```\n---\n````'
    const result = maskCodeFenceSeparators(md)
    expect(result).toContain('\x00FENCE_SEP\x00')
  })
})

// ── parseSlides ─────────────────────────────────────────────────────────────

const wrap = (globalFm: string, ...slides: string[]) =>
  `\n---\n${globalFm}\n---\n${slides.join('\n---\n')}`

describe('parseSlides', () => {
  it('extracts a single slide with a speaker note', () => {
    const md = wrap('title: Test', '# Slide 1\n<!-- Hello world -->')
    expect(parseSlides(md)).toEqual([{ page: 1, sections: ['Hello world'] }])
  })

  it('skips slides without any HTML comment', () => {
    const md = wrap('title: Test', '# No note', '# Has note\n<!-- note -->')
    expect(parseSlides(md)).toEqual([{ page: 2, sections: ['note'] }])
  })

  it('splits on [click] into multiple sections', () => {
    const md = wrap('title: Test', '# Slide\n<!-- intro [click] detail -->')
    expect(parseSlides(md)).toEqual([{ page: 1, sections: ['intro', 'detail'] }])
  })

  it('[click] is case-insensitive', () => {
    const md = wrap('title: Test', '# Slide\n<!-- a [CLICK] b -->')
    expect(parseSlides(md)).toEqual([{ page: 1, sections: ['a', 'b'] }])
  })

  it('does not count slide-specific frontmatter blocks as pages', () => {
    const md = wrap(
      'title: Test',
      '# Slide 1\n<!-- note1 -->',
      'layout: center',           // FM block — must NOT increment page
      '# Slide 2\n<!-- note2 -->',
    )
    const result = parseSlides(md)
    expect(result).toEqual([
      { page: 1, sections: ['note1'] },
      { page: 2, sections: ['note2'] },
    ])
  })

  // regression test for bug fixed in commit 8eae12b
  it('does not split on --- inside a code fence', () => {
    const md = wrap(
      'title: Test',
      '# Slide 1\n```yaml\nfoo: bar\n---\nbaz: qux\n```\n<!-- note1 -->',
      '# Slide 2\n<!-- note2 -->',
    )
    const result = parseSlides(md)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ page: 1, sections: ['note1'] })
    expect(result[1]).toEqual({ page: 2, sections: ['note2'] })
  })

  it('handles multiple clicks across several slides', () => {
    const md = wrap(
      'title: Test',
      '# A\n<!-- s1 [click] s1b -->',
      '# B\n<!-- s2 -->',
      '# C\n<!-- s3 [click] s3b [click] s3c -->',
    )
    expect(parseSlides(md)).toEqual([
      { page: 1, sections: ['s1', 's1b'] },
      { page: 2, sections: ['s2'] },
      { page: 3, sections: ['s3', 's3b', 's3c'] },
    ])
  })
})

// ── parseFrontmatterTtsConfigFromString ─────────────────────────────────────

describe('parseFrontmatterTtsConfigFromString', () => {
  it('returns empty object when no frontmatter present', () => {
    expect(parseFrontmatterTtsConfigFromString('# Slide')).toEqual({})
  })

  it('parses voiceName, languageCode, clickBreakTime', () => {
    const md = `---
title: Test
ttsConfig:
  voiceName: en-US-Neural2-A
  languageCode: en-US
  clickBreakTime: 300ms
---
# Slide`
    expect(parseFrontmatterTtsConfigFromString(md)).toEqual({
      voiceName: 'en-US-Neural2-A',
      languageCode: 'en-US',
      clickBreakTime: '300ms',
    })
  })

  it('returns undefined for keys not present in ttsConfig', () => {
    const md = `---
ttsConfig:
  voiceName: ja-JP-Neural2-B
---`
    const result = parseFrontmatterTtsConfigFromString(md)
    expect(result.voiceName).toBe('ja-JP-Neural2-B')
    expect(result.languageCode).toBeUndefined()
    expect(result.clickBreakTime).toBeUndefined()
  })
})
