<script>
let transitionCartoonUid = 0
</script>

<script setup>
import { computed } from 'vue'
import { PALETTE } from './signedRfMath.js'

const props = defineProps({
  mode: { type: String, default: 'coupling' },
  height: { type: Number, default: 170 },
})

const width = 420
const uid = `rf-transition-${transitionCartoonUid++}`
const isFlow = computed(() => props.mode === 'flow')
const sourceSymbol = computed(() => (isFlow.value ? 'Z₀' : 'X₀'))
const targetSymbol = computed(() => (isFlow.value ? 'Z₁' : 'X₁'))

const sourceDots = [
  [-18, -20], [5, -25], [20, -14], [-28, -4], [-7, -5], [15, 2], [31, 9],
  [-19, 18], [3, 20], [22, 27], [-2, 35],
]

const targetDots = [
  [-22, -23], [-8, -31], [5, -21], [18, -29], [-15, -10], [12, -8],
  [-20, 17], [-4, 27], [10, 15], [25, 24], [4, 36],
]

const couplingThreads = [
  'M 118 61 C 170 34, 235 111, 302 64',
  'M 118 73 C 175 101, 238 44, 302 78',
  'M 118 85 C 174 58, 242 123, 302 92',
  'M 118 98 C 184 132, 243 61, 302 106',
  'M 118 111 C 180 80, 240 142, 302 119',
]

const flowThreads = [
  'M 118 68 C 173 66, 238 54, 302 65',
  'M 118 79 C 178 80, 240 76, 302 79',
  'M 118 91 C 180 92, 240 91, 302 92',
  'M 118 103 C 178 104, 240 108, 302 106',
  'M 118 114 C 173 116, 238 128, 302 119',
]
</script>

<template>
  <div class="transition-cartoon-wrap" :style="{ height: `${props.height}px` }">
    <svg
      :viewBox="`0 0 ${width} 170`"
      role="img"
      :aria-label="isFlow ? 'Causal ODE from noise to data' : 'Interpolation coupling between noise and data'"
    >
      <defs>
        <filter :id="`${uid}-shadow`" x="-15%" y="-15%" width="130%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#1B2A4A" flood-opacity="0.11" />
        </filter>
        <marker :id="`${uid}-arrow`" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L9,4.5 L0,9 Z" :fill="PALETTE.samplingDark" />
        </marker>
        <linearGradient :id="`${uid}-ribbon`" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" :stop-color="PALETTE.sampling" stop-opacity="0.10" />
          <stop offset="50%" :stop-color="PALETTE.sampling" stop-opacity="0.22" />
          <stop offset="100%" :stop-color="PALETTE.sampling" stop-opacity="0.07" />
        </linearGradient>
      </defs>

      <ellipse cx="72" cy="88" rx="57" ry="69" :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" stroke-width="1.4" :filter="`url(#${uid}-shadow)`" />
      <ellipse cx="348" cy="88" rx="57" ry="69" :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" stroke-width="1.4" :filter="`url(#${uid}-shadow)`" />

      <g transform="translate(72 88)">
        <ellipse cx="0" cy="5" rx="35" ry="32" :fill="PALETTE.sampling" opacity="0.08" />
        <circle v-for="(point, i) in sourceDots" :key="`source-${i}`" :cx="point[0]" :cy="point[1] + 9" r="2.6" :fill="PALETTE.sampling" opacity="0.82" />
      </g>
      <g transform="translate(348 88)">
        <ellipse cx="-4" cy="-14" rx="34" ry="22" :fill="PALETTE.sampling" opacity="0.08" />
        <ellipse cx="4" cy="24" rx="34" ry="22" :fill="PALETTE.sampling" opacity="0.08" />
        <circle v-for="(point, i) in targetDots" :key="`target-${i}`" :cx="point[0]" :cy="point[1] + 5" r="2.6" :fill="PALETTE.samplingDark" opacity="0.82" />
      </g>

      <g v-if="!isFlow">
        <path
          v-for="(path, i) in couplingThreads"
          :key="`coupling-${i}`"
          :d="path"
          fill="none"
          :stroke="i % 2 ? PALETTE.sampling : PALETTE.traj"
          stroke-width="2.15"
          stroke-opacity="0.72"
          stroke-dasharray="7 6"
          stroke-linecap="round"
        />
        <circle cx="118" cy="61" r="4.4" :fill="PALETTE.sampling" stroke="#FFFFFF" stroke-width="1.5" />
        <circle cx="302" cy="64" r="4.4" :fill="PALETTE.samplingDark" stroke="#FFFFFF" stroke-width="1.5" />
      </g>

      <g v-else>
        <path d="M 118 59 C 176 46, 241 46, 303 58 L 303 125 C 241 136, 176 136, 118 123 Z" :fill="`url(#${uid}-ribbon)`" />
        <path
          v-for="(path, i) in flowThreads"
          :key="`flow-${i}`"
          :d="path"
          fill="none"
          :stroke="i === 2 ? PALETTE.samplingDark : PALETTE.sampling"
          :stroke-width="i === 2 ? 4.2 : 2.15"
          :stroke-opacity="i === 2 ? 0.98 : 0.48"
          stroke-linecap="round"
          :marker-end="i === 2 ? `url(#${uid}-arrow)` : undefined"
        />
      </g>

      <text x="72" y="48" class="symbol-label">{{ sourceSymbol }}</text>
      <text x="72" y="139" class="role-label">noise</text>
      <text x="348" y="48" class="symbol-label">{{ targetSymbol }}</text>
      <text x="348" y="139" class="role-label">data</text>
      <text x="210" y="154" class="connector-label">{{ isFlow ? 'causal ODE' : 'sampled coupling' }}</text>
    </svg>
  </div>
</template>

<style scoped>
.transition-cartoon-wrap {
  width: 100%;
}

svg {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.symbol-label,
.role-label,
.connector-label {
  font-family: var(--scholarly-font-serif), KaTeX_Main, serif;
  text-anchor: middle;
}

.symbol-label {
  fill: #253a88;
  font-size: 27px;
  font-style: italic;
  font-weight: 700;
}

.role-label {
  fill: #536073;
  font-size: 14px;
  font-weight: 700;
}

.connector-label {
  fill: #536073;
  font-size: 12px;
}
</style>
