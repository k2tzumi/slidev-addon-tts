import { readFileSync } from 'node:fs'
import type { DictEntry } from '../types'
import type { SlideNote } from './ssml-builder.js'

export type { SlideNote }

export interface FrontmatterTtsConfig {
  voiceName?: string
  languageCode?: string
  clickBreakTime?: string
  dictionary?: DictEntry[]
}

export function parseFrontmatterTtsConfig(filePath: string): FrontmatterTtsConfig {
  try {
    const md = readFileSync(filePath, 'utf-8')
    return parseFrontmatterTtsConfigFromString(md)
  } catch {
    return {}
  }
}

function parseDictEntries(block: string): DictEntry[] {
  const entries: DictEntry[] = []
  let current: Partial<DictEntry> = {}

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue

    const itemMatch = line.match(/^-+\s*from:\s*["']?(.*?)["']?$/)
    if (itemMatch) {
      if (current.from && current.to) entries.push(current as DictEntry)
      current = { from: itemMatch[1].trim() }
      continue
    }

    const fromMatch = line.match(/^from:\s*["']?(.*?)["']?$/)
    if (fromMatch) {
      current.from = fromMatch[1].trim()
      continue
    }

    const toMatch = line.match(/^to:\s*["']?(.*?)["']?$/)
    if (toMatch) {
      current.to = toMatch[1].trim()
    }
  }

  if (current.from && current.to) entries.push(current as DictEntry)
  return entries
}

function parseTtsDictionaryFromFrontmatter(md: string): DictEntry[] {
  const ttsBlock = md.match(/^tts:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const dictionaryBlock = ttsBlock.match(/^\s*dictionary:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const ttsConfigBlock = md.match(/^ttsConfig:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const ttsConfigDictionaryBlock = ttsConfigBlock.match(/^\s*dictionary:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  return [
    ...parseDictEntries(ttsConfigDictionaryBlock),
    ...parseDictEntries(dictionaryBlock),
  ]
}

function parseSlideDictionaryFromFrontmatter(block: string): DictEntry[] {
  const ttsDictBlock = block.match(/^ttsDict:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const ttsBlock = block.match(/^tts:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const dictionaryBlock = ttsBlock.match(/^\s*dictionary:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  return [
    ...parseDictEntries(ttsDictBlock),
    ...parseDictEntries(dictionaryBlock),
  ]
}

export function parseFrontmatterTtsConfigFromString(md: string): FrontmatterTtsConfig {
  const parts = md.split(/^---$/m)
  if (parts.length < 2) return {}
  const fm = parts[1]
  const block = fm.match(/^ttsConfig:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const get = (key: string) => block.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'))?.[1]?.trim()
  const dictionary = parseTtsDictionaryFromFrontmatter(fm)
  return {
    voiceName: get('voiceName'),
    languageCode: get('languageCode'),
    clickBreakTime: get('clickBreakTime'),
    ...(dictionary.length > 0 ? { dictionary } : {}),
  }
}

/**
 * Treat a `---` block as slide-specific frontmatter when it contains no HTML comments,
 * Markdown headings, code fences, HTML tags, or tables, and every non-empty line looks
 * like a YAML key: value pair.
 */
export function isSlideSpecificFrontmatter(block: string): boolean {
  const trimmed = block.trim()
  if (!trimmed) return false
  if (trimmed.includes('<!--')) return false
  if (/^#{1,6}\s/m.test(trimmed)) return false
  if (/^```/m.test(trimmed)) return false
  if (/^<[a-zA-Z]/m.test(trimmed)) return false
  if (/^\|/m.test(trimmed)) return false

  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean)
  return lines.length > 0 && lines.every(l => /^[\w-]+\s*:/.test(l) || /^\s/.test(l) || /^-\s+/.test(l))
}

export function extractLastComment(block: string): string {
  const withoutCodeBlocks = block.replace(/```[\s\S]*?```/g, '')
  const matches = [...withoutCodeBlocks.matchAll(/<!--([\s\S]*?)-->/g)]
  return matches.length > 0 ? matches[matches.length - 1][1].trim() : ''
}

/**
 * Replace `---` lines inside fenced code blocks with a placeholder so they are
 * not mistaken for slide separators when the markdown is later split on `---`.
 */
export function maskCodeFenceSeparators(md: string): string {
  const PLACEHOLDER = '\x00FENCE_SEP\x00'
  const lines = md.split('\n')
  let inFence = false
  let fenceChar = ''
  let fenceLen = 0
  const out: string[] = []

  for (const line of lines) {
    if (!inFence) {
      const m = line.match(/^(`{3,}|~{3,})/)
      if (m) {
        inFence = true
        fenceChar = m[1][0]
        fenceLen = m[1].length
      }
      out.push(line)
    } else {
      const m = line.match(/^(`{3,}|~{3,})\s*$/)
      if (m && m[1][0] === fenceChar && m[1].length >= fenceLen) {
        inFence = false
      }
      out.push(line === '---' ? PLACEHOLDER : line)
    }
  }
  return out.join('\n')
}

export function parseSlides(md: string): SlideNote[] {
  const PLACEHOLDER = '\x00FENCE_SEP\x00'
  const masked = maskCodeFenceSeparators(md)
  const parts = masked.split(/^---$/m)
  const unmask = (s: string) => s.replace(new RegExp(PLACEHOLDER, 'g'), '---')
  const result: SlideNote[] = []
  let page = 0
  let pendingSlideFrontmatter = ''

  // parts[0] = before global FM (empty), parts[1] = global FM, parts[2]+ = slides
  for (let i = 2; i < parts.length; i++) {
    const block = unmask(parts[i])

    if (isSlideSpecificFrontmatter(block)) {
      pendingSlideFrontmatter = block
      continue
    }

    page++
    const raw = extractLastComment(block)
    if (!raw) {
      pendingSlideFrontmatter = ''
      continue
    }

    const sections = raw.split(/\[click\]/i).map(s => s.trim()).filter(Boolean)
    const dictionary = parseSlideDictionaryFromFrontmatter(pendingSlideFrontmatter)
    pendingSlideFrontmatter = ''

    if (sections.length > 0) {
      const slideNote: SlideNote = { page, sections }
      if (dictionary.length > 0) slideNote.dictionary = dictionary
      result.push(slideNote)
    }
  }

  return result
}
