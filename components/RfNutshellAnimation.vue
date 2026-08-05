<script setup>
import { resolveAssetUrl, useIsSlideActive } from '@slidev/client'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  sequence: { type: String, required: true },
  alt: { type: String, required: true },
  frames: { type: Number, default: 20 },
  fps: { type: Number, default: 5 },
})

const isSlideActive = useIsSlideActive()
const frame = ref(0)
let timer
let preloaded = false

const framePath = index => resolveAssetUrl(
  `/figures/cmu/${props.sequence}/frame_${String(index).padStart(2, '0')}.png`,
)

const frameUrl = computed(() => framePath(frame.value))

function preloadFrames() {
  if (preloaded || typeof Image === 'undefined')
    return

  preloaded = true
  for (let index = 0; index < props.frames; index += 1) {
    const image = new Image()
    image.src = framePath(index)
  }
}

function stop() {
  if (timer !== undefined) {
    window.clearInterval(timer)
    timer = undefined
  }
}

function start() {
  stop()
  preloadFrames()
  frame.value = 0
  timer = window.setInterval(() => {
    frame.value = (frame.value + 1) % props.frames
  }, 1000 / props.fps)
}

watch(isSlideActive, (active, _previous, onCleanup) => {
  if (active)
    start()
  else
    stop()

  onCleanup(stop)
}, { immediate: true })
</script>

<template>
  <img
    :src="frameUrl"
    :alt="alt"
    class="rf-nutshell-animation"
    draggable="false"
  >
</template>

<style scoped>
.rf-nutshell-animation {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}
</style>
