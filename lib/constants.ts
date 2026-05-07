export const ADDON_NAME = 'slidev-addon-tts'
export const LOG_TAG = `[${ADDON_NAME}]`

// IndexedDB
export const IDB_DB_NAME = ADDON_NAME
export const IDB_STORE_NAME = 'audio'

// Playback: finish current audio before switching if fewer than this many seconds remain
export const REMAINING_THRESHOLD = 5

// Default TTS voice configuration
export const DEFAULT_VOICE_NAME = 'ja-JP-Neural2-B'
export const DEFAULT_LANGUAGE_CODE = 'ja-JP'
export const DEFAULT_CLICK_BREAK_TIME = '500ms'

// SSML batch size limit (bytes)
export const SSML_MAX_BYTES = 4500

// Public path for pre-generated audio files
export const TTS_PUBLIC_BASE = '/tts'
