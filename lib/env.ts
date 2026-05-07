declare module 'vite/client' {}

interface ImportMetaEnv {
  readonly VITE_CLOUD_TTS_API_KEY?: string
}

export function getCloudTtsApiKey(): string | undefined {
  return import.meta.env.VITE_CLOUD_TTS_API_KEY
}
