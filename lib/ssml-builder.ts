import type { DictEntry } from '../types'

export interface SlideNote {
  page: number
  sections: string[]  // text sections split by [click]
  dictionary?: DictEntry[]
  /** When true, ignore global dictionary and only use slide-specific dictionary */
  disableGlobalDict?: boolean
}

export interface SsmlBuildResult {
  ssml: string
  pages: number[]
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildDictionary(
  globalDict: DictEntry[] = [],
  slideDict: DictEntry[] = [],
): DictEntry[] {
  const merged = new Map<string, DictEntry>()
  for (const entry of globalDict) {
    merged.set(entry.from, entry)
  }
  for (const entry of slideDict) {
    merged.set(entry.from, entry)
  }
  return [...merged.values()]
}

export function applyDictionary(
  text: string,
  dict: DictEntry[],
): string {
  if (!dict.length) return text

  return dict
    .slice()
    .sort((a, b) => b.from.length - a.from.length)
    .reduce((result, entry) => {
      const replacement = `<sub alias="${escapeXml(entry.to)}">${escapeXml(entry.from)}</sub>`
      return result.replaceAll(entry.from, replacement)
    }, text)
}

/**
 * Convert an array of slide notes into SSML.
 * - Inserts <mark name="slide_{page}"/> at the start of each slide (equivalent to click_0)
 * - Inserts <mark name="slide_{page}_click_{n}"/> at each [click] boundary
 * - Inserts <break time="{breakTime}"/> between slides
 */
export function buildSsml(
  slides: SlideNote[],
  breakTime = '500ms',
  globalDictionary: DictEntry[] = [],
): SsmlBuildResult {
  const parts: string[] = ['<speak>']
  const pages: number[] = []

  for (let si = 0; si < slides.length; si++) {
    const { page, sections, dictionary, disableGlobalDict } = slides[si]
    const effectiveGlobalDict = disableGlobalDict ? [] : globalDictionary
    const dict = buildDictionary(effectiveGlobalDict, dictionary ?? [])
    pages.push(page)

    // insert a break between slides (skip for the first slide in the batch)
    if (si > 0) {
      parts.push(`<break time="${breakTime}"/>`)
    }

    // slide start mark (equivalent to click_0)
    parts.push(`<mark name="slide_${page}"/>`)
    parts.push(applyDictionary(escapeXml(sections[0] ?? ''), dict))

    for (let i = 1; i < sections.length; i++) {
      // no break at click boundaries — the user's click action serves as a natural pause;
      // inserting a break would cause silence at the start when seeking
      parts.push(`<mark name="slide_${page}_click_${i}"/>`)
      parts.push(applyDictionary(escapeXml(sections[i]), dict))
    }
  }

  parts.push('</speak>')
  return { ssml: parts.join('\n'), pages }
}

/**
 * Split slide notes into batches that fit within 4,500 bytes.
 * Batch boundaries fall on slide boundaries (never splits mid-slide).
 */
export function splitIntoBatches(
  slides: SlideNote[],
  breakTime = '500ms',
  maxBytes = 4500,
  globalDictionary: DictEntry[] = [],
): SsmlBuildResult[] {
  const batches: SsmlBuildResult[] = []
  let current: SlideNote[] = []
  let currentBytes = 0

  for (const slide of slides) {
    const { ssml } = buildSsml([slide], breakTime, globalDictionary)
    const bytes = new TextEncoder().encode(ssml).length

    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      batches.push(buildSsml(current, breakTime, globalDictionary))
      current = []
      currentBytes = 0
    }

    current.push(slide)
    currentBytes += bytes
  }

  if (current.length > 0) {
    batches.push(buildSsml(current, breakTime, globalDictionary))
  }

  return batches
}
