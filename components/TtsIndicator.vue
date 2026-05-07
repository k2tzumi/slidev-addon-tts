<script setup lang="ts">
import { isPlaying } from '../lib/state'
</script>

<template>
  <Transition name="tts-fade">
    <div v-if="isPlaying" class="tts-indicator">
      <span class="tts-icon">🔊</span>
    </div>
  </Transition>
</template>

<style scoped>
.tts-indicator {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border-radius: 9999px;
  padding: 0.4rem 0.8rem;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  pointer-events: none;
  user-select: none;
}

.tts-fade-enter-active,
.tts-fade-leave-active {
  transition: opacity 0.3s ease;
}

.tts-fade-enter-from,
.tts-fade-leave-to {
  opacity: 0;
}
</style>
