export interface SlideNote {
  page: number
  sections: string[]  // text sections split by [click]
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

/**
 * Convert an array of slide notes into SSML.
 * - Inserts <mark name="slide_{page}"/> at the start of each slide (equivalent to click_0)
 * - Inserts <mark name="slide_{page}_click_{n}"/> at each [click] boundary
 * - Inserts <break time="{breakTime}"/> between slides
 */
export function buildSsml(
  slides: SlideNote[],
  breakTime = '500ms',
): SsmlBuildResult {
  const parts: string[] = ['<speak>']
  const pages: number[] = []

  for (let si = 0; si < slides.length; si++) {
    const { page, sections } = slides[si]
    pages.push(page)

    // insert a break between slides (skip for the first slide in the batch)
    if (si > 0) {
      parts.push(`<break time="${breakTime}"/>`)
    }

    // slide start mark (equivalent to click_0)
    parts.push(`<mark name="slide_${page}"/>`)
    parts.push(escapeXml(sections[0] ?? ''))

    for (let i = 1; i < sections.length; i++) {
      // no break at click boundaries — the user's click action serves as a natural pause;
      // inserting a break would cause silence at the start when seeking
      parts.push(`<mark name="slide_${page}_click_${i}"/>`)
      parts.push(escapeXml(sections[i]))
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
): SsmlBuildResult[] {
  const batches: SsmlBuildResult[] = []
  let current: SlideNote[] = []
  let currentBytes = 0

  for (const slide of slides) {
    const { ssml } = buildSsml([slide], breakTime)
    const bytes = new TextEncoder().encode(ssml).length

    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      batches.push(buildSsml(current, breakTime))
      current = []
      currentBytes = 0
    }

    current.push(slide)
    currentBytes += bytes
  }

  if (current.length > 0) {
    batches.push(buildSsml(current, breakTime))
  }

  return batches
}
