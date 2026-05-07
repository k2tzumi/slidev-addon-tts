<script setup lang="ts">
import { useNav } from '@slidev/client'
import { computed, onMounted, inject } from 'vue'
import { LOG_TAG as TAG } from './lib/constants'
import { resolveConfig } from './lib/config-loader'
import { usePlaybackController } from './lib/use-playback-controller'
import type { TtsAddonConfig } from './types'

const nav = useNav() as any

const resolvedConfig = resolveConfig(nav, inject)
const isTtsEnabled = resolvedConfig !== null
const config: TtsAddonConfig = resolvedConfig ?? {}

const isPrintMode = computed(() => {
  if (typeof window === 'undefined') return false
  const params = new URL(window.location.href).searchParams
  return params.has('print') || document.body.classList.contains('print') || document.body.classList.contains('slidev-page-print')
})

const { audioState, hasCurrentNotes, handleIndicatorClick } = usePlaybackController(nav, config, isTtsEnabled)

onMounted(() => {
  if (!isTtsEnabled) return
  audioState.value = 'idle'
  console.log(`${TAG} config:`, JSON.stringify(config))
  console.log(`${TAG} mode:`, config.usePregenerated !== false ? 'pregenerated' : 'on-demand')
})
</script>

<template>
  <Transition name="tts-fade">
    <!--
      hasCurrentNotes: hidden when the current slide/click has no notes
      done: hidden after natural completion to provide visual feedback
      isPrintMode: hidden in print/export mode
    -->
    <div
      v-if="isTtsEnabled && hasCurrentNotes && audioState !== 'done' && !isPrintMode"
      class="tts-indicator"
      :class="{ 'is-playing': audioState === 'playing' }"
      role="button"
      :title="audioState === 'playing' ? 'Stop' : 'Play'"
      @click="handleIndicatorClick"
    >
      <span class="tts-icon">
        <template v-if="audioState === 'playing'">🔊</template>
        <template v-else>▶</template>
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.tts-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  color: white;
  border-radius: 9999px;
  padding: 0.4rem 0.8rem;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s, opacity 0.2s;

  /* idle (▶): dim display */
  background: rgba(0, 0, 0, 0.35);
  opacity: 0.6;
}

.tts-indicator:hover {
  opacity: 1;
  background: rgba(0, 0, 0, 0.6);
}

/* playing (🔊): bright display with pulse animation */
.tts-indicator.is-playing {
  background: rgba(0, 0, 0, 0.7);
  opacity: 1;
  animation: tts-pulse 2s ease-in-out infinite;
}

@keyframes tts-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.3); }
  50% { box-shadow: 0 0 0 6px rgba(255, 255, 255, 0); }
}

.tts-fade-enter-active,
.tts-fade-leave-active {
  transition: opacity 0.3s ease;
}

.tts-fade-enter-from,
.tts-fade-leave-to {
  opacity: 0;
}

@media print {
  .tts-indicator {
    display: none !important;
  }
}
</style>
