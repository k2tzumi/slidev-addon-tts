import { unref } from 'vue'
import { LOG_TAG } from './constants'
import type { TtsAddonConfig } from '../types'

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
  if (navConfigs?.ttsConfig) return navConfigs.ttsConfig as TtsAddonConfig

  const directConfigs = unref(anyNav.configs)
  if (directConfigs?.ttsConfig) return directConfigs.ttsConfig as TtsAddonConfig

  for (const key of ['$slidev', 'slidev', 'slidev-context']) {
    try {
      const ctx = injectFn(key, null) as any
      const cfg = unref(ctx?.configs ?? ctx)
      if (cfg?.ttsConfig) return cfg.ttsConfig as TtsAddonConfig
    } catch {}
  }

  const slides = anyNav.slides
  const meta0 = (slides?.value?.[0]?.meta as any)
  const fm0 = unref(meta0?.slide?.frontmatter ?? meta0?.frontmatter)
  if (fm0?.ttsConfig) return fm0.ttsConfig as TtsAddonConfig

  console.warn(`${LOG_TAG} ttsConfig not found in slides.md frontmatter`)
  return null
}
