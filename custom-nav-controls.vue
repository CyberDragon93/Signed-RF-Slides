<script setup lang="ts">
// Laser-pointer cursor toggle, docked right beside the drawing-pen button.
// When active, the cursor over the slide area becomes a glowing red dot
// (pure CSS cursor swap on #slide-container — see styles/index.css).
import { onMounted, onUnmounted, ref } from 'vue'

const laserOn = ref(false)
const btn = ref<HTMLElement | null>(null)

function toggleLaser() {
  laserOn.value = !laserOn.value
  document.body.classList.toggle('laser-cursor', laserOn.value)
}

onMounted(() => {
  // The custom-controls slot sits at the end of the nav bar; the user wants
  // this next to the pen, so re-dock the button after the drawing toggle.
  const pen = document.querySelector('button[title="Show drawing toolbar"]')
  if (pen && btn.value) pen.insertAdjacentElement('afterend', btn.value)
})

onUnmounted(() => {
  document.body.classList.remove('laser-cursor')
})
</script>

<template>
  <button
    ref="btn"
    class="slidev-icon-btn"
    :class="{ 'important-text-primary': laserOn }"
    title="Laser pointer cursor"
    @click="toggleLaser"
  >
    <svg width="1.2em" height="1.2em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
      <circle cx="12" cy="12" r="3.2" :fill="laserOn ? 'currentColor' : 'none'" />
      <path d="M12 4.6 V2.4" />
      <path d="M12 21.6 V19.4" />
      <path d="M4.6 12 H2.4" />
      <path d="M21.6 12 H19.4" />
      <path d="M6.8 6.8 L5.2 5.2" />
      <path d="M18.8 18.8 L17.2 17.2" />
      <path d="M6.8 17.2 L5.2 18.8" />
      <path d="M18.8 5.2 L17.2 6.8" />
    </svg>
  </button>
</template>
