export type DictEntry = {
  from: string
  to: string
}

export interface TtsAddonConfig {
  /** Voice name to use. Default: 'ja-JP-Wavenet-D' (WaveNet supports timepoints) */
  voiceName?: string
  /** Language code. Default: 'ja-JP' */
  languageCode?: string
  /** Break duration inserted between [click] sections. Default: '500ms' */
  clickBreakTime?: string
  /** Global pronunciation dictionary entries from root frontmatter */
  dictionary?: DictEntry[]
  /**
   * true: use static files from public/tts/ (pre-generated mode)
   * false: call Cloud TTS API on demand from the browser (on-demand mode)
   * Default: true
   */
  usePregenerated?: boolean
  /** Prefetch the next slide in the background. Default: true */
  prefetch?: boolean
}
