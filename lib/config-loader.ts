import { unref } from 'vue'
import { LOG_TAG } from './constants'
import type { TtsAddonConfig, DictEntry } from '../types'

function normalizeDictEntry(entry: unknown): DictEntry | null {
  if (!entry || typeof entry !== 'object') return null
  const from = (entry as any).from
  const to = (entry as any).to
  if (typeof from !== 'string' || typeof to !== 'string') return null
  return { from, to }
}

function normalizeDictionary(value: unknown): DictEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value
    .map(normalizeDictEntry)
    .filter((entry): entry is DictEntry => entry !== null)
}

function normalizeTtsConfig(config: any): TtsAddonConfig | null {
  if (!config || typeof config !== 'object') return null
  const normalized: TtsAddonConfig = {}
  if (typeof config.voiceName === 'string') normalized.voiceName = config.voiceName
  if (typeof config.languageCode === 'string') normalized.languageCode = config.languageCode
  if (typeof config.clickBreakTime === 'string') normalized.clickBreakTime = config.clickBreakTime
  const dictionary = normalizeDictionary(config.dictionary ?? config.tts?.dictionary)
  if (dictionary?.length) normalized.dictionary = dictionary
  return normalized
}

/**
 * Resolve ttsConfig from the Slidev runtime context.
 * Probes multiple locations because the Slidev API surface has changed across versions.
 *
 * @param nav - return value of useNav() cast to any
 * @param injectFn - Vue's inject() — must be called from within <script setup>
 */
export function resolveConfig(
  nav: unknown,
  injectFn: (key: string, defaultValue?: unknown) => unknown,
): TtsAddonConfig | null {
  const anyNav = nav as any

  const navSlidev = unref(anyNav.$slidev)
  const navConfigs = unref(navSlidev?.configs)
  const normalizedNavConfig = normalizeTtsConfig(navConfigs?.ttsConfig ?? navConfigs?.tts)
  if (normalizedNavConfig) return normalizedNavConfig

  const directConfigs = unref(anyNav.configs)
  const normalizedDirectConfig = normalizeTtsConfig(directConfigs?.ttsConfig ?? directConfigs?.tts)
  if (normalizedDirectConfig) return normalizedDirectConfig

  for (const key of ['$slidev', 'slidev', 'slidev-context']) {
    try {
      const ctx = injectFn(key, null) as any
      const cfg = unref(ctx?.configs ?? ctx)
      const normalized = normalizeTtsConfig(cfg?.ttsConfig ?? cfg?.tts)
      if (normalized) return normalized
    } catch {}
  }

  const slides = anyNav.slides
  const meta0 = (slides?.value?.[0]?.meta as any)
  const fm0 = unref(meta0?.slide?.frontmatter ?? meta0?.frontmatter)
  const normalizedMetaConfig = normalizeTtsConfig(fm0?.ttsConfig ?? fm0?.tts)
  if (normalizedMetaConfig) return normalizedMetaConfig

  console.warn(`${LOG_TAG} ttsConfig not found in slides.md frontmatter`)
  return null
}
