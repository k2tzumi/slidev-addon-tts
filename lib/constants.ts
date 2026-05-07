export const ADDON_NAME = 'slidev-addon-tts'
export const LOG_TAG = `[${ADDON_NAME}]`

// IndexedDB
export const IDB_DB_NAME = ADDON_NAME
export const IDB_STORE_NAME = 'audio'

// Playback: finish current audio before switching if fewer than this many seconds remain
export const REMAINING_THRESHOLD = 5
