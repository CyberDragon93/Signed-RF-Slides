<script setup>
// HTML label overlay for SVG figures.
//
// WebKit paints foreignObject content at the wrong offset whenever the SVG
// sits inside a CSS-scaled ancestor (Slidev's page zoom): KaTeX's relative-
// positioned internals drop by offset/scale, so every math label on mobile
// Safari lands off target. Layout boxes are correct — it is purely a paint
// bug, and no CSS on the foreignObject side fixes it without introducing a
// new constant offset.
//
// The robust fix is to keep labels OUT of the SVG: this component renders a
// label as absolutely-positioned HTML inside the figure's wrap div (which
// must be position: relative and wrap exactly the SVG box), converting
// viewBox coordinates to percentages. Plain HTML under the page transform
// paints correctly in every engine.
import { computed } from 'vue'

const props = defineProps({
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  w: { type: Number, required: true },
  vbW: { type: Number, default: 900 },
  vbH: { type: Number, required: true },
})

const style = computed(() => ({
  left: `${(props.x / props.vbW) * 100}%`,
  top: `${(props.y / props.vbH) * 100}%`,
  width: `${(props.w / props.vbW) * 100}%`,
}))
</script>

<template>
  <div class="rf-fig-label" :style="style">
    <slot />
  </div>
</template>

<style scoped>
.rf-fig-label {
  position: absolute;
  pointer-events: none;
}
</style>
