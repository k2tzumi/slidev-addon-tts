import { readFileSync } from 'node:fs'
import type { SlideNote } from './ssml-builder.js'

export type { SlideNote }

export interface FrontmatterTtsConfig {
  voiceName?: string
  languageCode?: string
  clickBreakTime?: string
}

export function parseFrontmatterTtsConfig(filePath: string): FrontmatterTtsConfig {
  try {
    const md = readFileSync(filePath, 'utf-8')
    return parseFrontmatterTtsConfigFromString(md)
  } catch {
    return {}
  }
}

export function parseFrontmatterTtsConfigFromString(md: string): FrontmatterTtsConfig {
  const parts = md.split(/^---$/m)
  if (parts.length < 2) return {}
  const fm = parts[1]
  const block = fm.match(/^ttsConfig:\s*\n((?:[ \t]+.+\n?)*)/m)?.[1] ?? ''
  const get = (key: string) => block.match(new RegExp(`^\\s+${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'))?.[1]?.trim()
  return { voiceName: get('voiceName'), languageCode: get('languageCode'), clickBreakTime: get('clickBreakTime') }
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
  return lines.length > 0 && lines.every(l => /^[\w-]+\s*:/.test(l) || /^\s/.test(l))
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

  // parts[0] = before global FM (empty), parts[1] = global FM, parts[2]+ = slides
  for (let i = 2; i < parts.length; i++) {
    const block = unmask(parts[i])

    if (isSlideSpecificFrontmatter(block)) continue

    page++
    const raw = extractLastComment(block)
    if (!raw) continue

    const sections = raw.split(/\[click\]/i).map(s => s.trim()).filter(Boolean)
    if (sections.length > 0) result.push({ page, sections })
  }

  return result
}
