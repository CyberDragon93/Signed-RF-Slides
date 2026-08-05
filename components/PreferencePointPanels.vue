<script setup>
const props = defineProps({
  height: { type: Number, default: 350 },
})

const width = 900

function makePoints(cx, cy, count, spreadX, spreadY) {
  return Array.from({ length: count }, (_, i) => {
    const angle = i * 2.399963229728653
    const radius = Math.sqrt((i + 1) / count)
    return {
      x: cx + Math.cos(angle) * spreadX * radius,
      y: cy + Math.sin(angle) * spreadY * radius,
    }
  })
}

const preferred = makePoints(245, 205, 34, 142, 105)
const forbidden = makePoints(655, 205, 34, 142, 105)
</script>

<template>
  <div class="preference-panels-wrap" :style="{ height: `${props.height}px` }">
    <svg
      :viewBox="`0 0 ${width} ${props.height}`"
      role="img"
      aria-label="Preferred examples shown as green squares and forbidden examples shown as red circles"
    >
      <line x1="450" y1="42" x2="450" :y2="props.height - 18" class="panel-divider" />

      <text x="245" y="42" class="panel-title preferred-title">Preferred 👍</text>
      <text x="655" y="42" class="panel-title forbidden-title">Forbidden 🚫</text>

      <rect
        v-for="(point, i) in preferred"
        :key="`preferred-${i}`"
        :x="point.x - 6"
        :y="point.y - 6"
        width="12"
        height="12"
        rx="1"
        class="preferred-point"
      />

      <circle
        v-for="(point, i) in forbidden"
        :key="`forbidden-${i}`"
        :cx="point.x"
        :cy="point.y"
        r="6.5"
        class="forbidden-point"
      />
    </svg>
  </div>
</template>

<style scoped>
.preference-panels-wrap {
  width: 100%;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
}

.panel-divider {
  stroke: #d9e0ef;
  stroke-width: 1.5;
}

.panel-title {
  font-family: var(--scholarly-font-serif), serif;
  font-size: 25px;
  font-weight: 700;
  text-anchor: middle;
}

.preferred-title {
  fill: #3d8737;
}

.forbidden-title {
  fill: #c65343;
}

.preferred-point {
  fill: #5a9b52;
  stroke: #2f6f2b;
  stroke-width: 1.2;
}

.forbidden-point {
  fill: #dc6254;
  stroke: #a93d32;
  stroke-width: 1.2;
}
</style>
