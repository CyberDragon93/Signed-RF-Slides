<script>
// Module-scope instance counter for unique SVG defs ids (deterministic, no randomness).
let srfgUidCounter = 0
</script>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  SCHEMA, DENSITY, TWIN, PALETTE,
  signedDensity, zeroBranches, quantileSeeds, simulateTrajectories,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const uid = `srfg-${srfgUidCounter++}`

// ---------------------------------------------------------------- panel specs
// Six worlds, no captions — the pictures carry the point. Two extra setups
// beyond the paper ones, chosen for distinct boundary topologies:
// MODE2: two positive modes, the negative branch sits on one of them — the
// surviving positive peak becomes an island between two negative zones.
const MODE2 = {
  plus: [
    { w: 0.5, mu: -1.6, vr: 0.35 },
    { w: 0.5, mu: 1.6, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 1.6, vr: 0.45 }],
  domain: [-3.4, 3.4],
}

// CORE: a narrow negative core carved out of the centre of a broad positive —
// the zero set is a closed lens and trajectories split around it.
const CORE = {
  plus: [{ w: 1.0, mu: 0.0, vr: 1.2 }],
  minus: [{ w: 1.0, mu: 0.0, vr: 0.15 }],
  domain: [-3.4, 3.4],
}

const PANEL_DEFS = [
  { id: 'schema1', setup: SCHEMA, alpha: 1.0 },
  { id: 'density', setup: DENSITY, alpha: 0.85 },
  { id: 'mode2', setup: MODE2, alpha: 1.0 },
  { id: 'twin', setup: TWIN, alpha: 0.8 },
  { id: 'core', setup: CORE, alpha: 0.9 },
  { id: 'schema2', setup: SCHEMA, alpha: 2.0 },
]

// ---------------------------------------------------------------- static math
// Everything below is computed exactly once: the gallery is a static render
// (complete immediately, deterministic in print/export).

// 2-tone sign heatmap: blue where pi_t^sign > 0, magenta where < 0,
// standard alpha recipe 0.02 + 0.28 * (|s|/max|s|)^0.75.
function renderPanelHeatmap(alpha, setup) {
  if (typeof document === 'undefined') return ''
  const W = 200
  const H = 120
  const [lo, hi] = setup.domain
  const vals = new Float64Array(W * H)
  let maxAbs = 1e-12
  for (let r = 0; r < H; r += 1) {
    const x = hi - (r / (H - 1)) * (hi - lo)
    for (let c = 0; c < W; c += 1) {
      const s = signedDensity(x, c / (W - 1), alpha, setup)
      vals[r * W + c] = s
      const av = Math.abs(s)
      if (av > maxAbs) maxAbs = av
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const image = ctx.createImageData(W, H)
  const cBlue = [73, 105, 226]
  const cNeg = [227, 74, 146]
  for (let i = 0; i < W * H; i += 1) {
    const s = vals[i]
    const col = s < 0 ? cNeg : cBlue
    const af = 0.02 + 0.28 * Math.pow(Math.abs(s) / maxAbs, 0.75)
    const off = 4 * i
    image.data[off] = col[0]
    image.data[off + 1] = col[1]
    image.data[off + 2] = col[2]
    image.data[off + 3] = Math.round(255 * af)
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

const panelData = PANEL_DEFS.map(def => ({
  ...def,
  heatmap: renderPanelHeatmap(def.alpha, def.setup),
  branches: zeroBranches(def.alpha, def.setup, 140),
  traj: simulateTrajectories(quantileSeeds(12), def.alpha, def.setup, 320),
}))

// ---------------------------------------------------------------- layout
const COLS = 3
const GUT = 14
const CARD_W = 282
const MARGIN_X = (width - (COLS * CARD_W + (COLS - 1) * GUT)) / 2

const cardH = computed(() => (props.height - 14 - GUT - 30) / 2)

const panels = computed(() => {
  const ch = cardH.value
  return panelData.map((p, i) => {
    const col = i % COLS
    const row = Math.floor(i / COLS)
    const cx = MARGIN_X + col * (CARD_W + GUT)
    const cy = 14 + row * (ch + GUT)
    const plotX = cx + 10
    const plotW = CARD_W - 20
    const plotY = cy + 10
    const plotH = Math.max(40, ch - 20)
    const [lo, hi] = p.setup.domain
    const px = t => plotX + t * plotW
    const py = xv => plotY + ((hi - xv) / (hi - lo)) * plotH

    const branchPaths = p.branches.map((line) => {
      let d = ''
      for (const [t, xv] of line) d += (d ? 'L' : 'M') + px(t).toFixed(1) + ',' + py(xv).toFixed(1)
      return d
    })

    const { times, paths } = p.traj
    const yLo = plotY - 30
    const yHi = plotY + plotH + 30
    const trajPaths = paths.map((arr) => {
      let d = ''
      for (let k = 0; k < arr.length; k += 2) {
        const yy = Math.max(yLo, Math.min(yHi, py(arr[k])))
        d += (d ? 'L' : 'M') + px(times[k]).toFixed(1) + ',' + yy.toFixed(1)
      }
      return d
    })

    return {
      id: p.id,
      heatmap: p.heatmap,
      traj: p.traj,
      lo,
      hi,
      cx,
      cy,
      ch,
      plotX,
      plotY,
      plotW,
      plotH,
      branchPaths,
      trajPaths,
    }
  })
})

// ---------------------------------------------------------------- animation
// One shared clock sweeps t: 0 -> 1 across all four worlds; trajectories are
// revealed up to the cursor and the endpoint dots ride them. Loops forever;
// print/export freezes on the complete t = 1 picture.
const SWEEP = 6.0
const HOLD = 1.6
const CYCLE = SWEEP + HOLD
const cursor = ref(1)
const playing = ref(props.autoplay)
let raf = 0
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete picture

function easeCubicInOut(u) {
  return u < 0.5 ? 4 * u * u * u : 1 - ((-2 * u + 2) ** 3) / 2
}

function tick(now) {
  if (playing.value) {
    if (!refTs) refTs = now
    const ph = ((now - refTs) / 1000 + phase0) % CYCLE
    cursor.value = ph < SWEEP ? easeCubicInOut(ph / SWEEP) : 1
  } else {
    refTs = 0
    phase0 = cursor.value >= 1 ? SWEEP : SWEEP * cursor.value
  }
  raf = requestAnimationFrame(tick)
}

function togglePlay() {
  playing.value = !playing.value
}

// Per-frame sweep geometry (cheap: O(panels x 12) interpolation).
const sweep = computed(() => {
  const c = cursor.value
  return panels.value.map((p) => {
    const dots = p.traj.paths.map((arr, j) => {
      const n = arr.length
      const idx = Math.max(0, Math.min(n - 1, Math.round(c * (n - 1))))
      const yy = p.plotY + ((p.hi - arr[idx]) / (p.hi - p.lo)) * p.plotH
      return { id: j, cy: Math.max(p.plotY, Math.min(p.plotY + p.plotH, yy)) }
    })
    return {
      id: p.id,
      cursorX: p.plotX + p.plotW * c,
      revealW: Math.max(0, p.plotW * c),
      dots,
    }
  })
})

const playBtn = computed(() => ({ x: MARGIN_X + 12, y: props.height - 14 }))

onMounted(() => {
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  if (props.autoplay && !isPrint) raf = requestAnimationFrame(tick)
  else cursor.value = 1
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
})
</script>

<template>
  <div class="srfg-wrap">
    <svg class="srfg-svg" :viewBox="`0 0 ${width} ${height}`" role="img">
      <defs>
        <filter :id="`${uid}-shadow`" x="-10%" y="-10%" width="120%" height="125%">
          <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#1B2A4A" flood-opacity="0.12" />
        </filter>
        <clipPath v-for="p in panels" :id="`${uid}-clip-${p.id}`" :key="`clip-${p.id}`">
          <rect :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH" />
        </clipPath>
        <!-- reveal clip: trajectories are swept out by the shared time cursor -->
        <clipPath v-for="(s, i) in sweep" :id="`${uid}-sweep-${s.id}`" :key="`sweep-${s.id}`">
          <rect
            :x="panels[i].plotX" :y="panels[i].plotY"
            :width="s.revealW" :height="panels[i].plotH"
          />
        </clipPath>
      </defs>

      <g v-for="(p, i) in panels" :key="p.id">
        <!-- card -->
        <rect
          :x="p.cx" :y="p.cy" :width="CARD_W" :height="p.ch" rx="8"
          :fill="PALETTE.panel" :stroke="PALETTE.panelBorder" :filter="`url(#${uid}-shadow)`"
        />

        <!-- (t, x) plot -->
        <rect
          :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH"
          fill="#FFFFFF" :stroke="PALETTE.grid" stroke-width="1"
        />
        <image
          v-if="p.heatmap"
          :x="p.plotX" :y="p.plotY" :width="p.plotW" :height="p.plotH"
          :href="p.heatmap" preserveAspectRatio="none"
        />

        <g :clip-path="`url(#${uid}-clip-${p.id})`">
          <!-- zero-boundary branches -->
          <path
            v-for="(d, j) in p.branchPaths"
            :key="`b-${j}`"
            :d="d"
            fill="none"
            :stroke="PALETTE.negative"
            stroke-width="1.3"
            stroke-opacity="0.9"
            stroke-linecap="round"
          />
        </g>

        <!-- 12 forward trajectories, revealed up to the shared cursor -->
        <g :clip-path="`url(#${uid}-sweep-${p.id})`">
          <path
            v-for="(d, j) in p.trajPaths"
            :key="`t-${j}`"
            :d="d"
            fill="none"
            :stroke="PALETTE.traj"
            stroke-width="0.85"
            stroke-opacity="0.5"
            stroke-linecap="round"
          />
        </g>

        <!-- moving cursor line + endpoint dots riding the trajectories -->
        <line
          v-if="cursor < 0.999"
          :x1="sweep[i].cursorX" :y1="p.plotY" :x2="sweep[i].cursorX" :y2="p.plotY + p.plotH"
          :stroke="PALETTE.ink" stroke-width="0.9" stroke-opacity="0.45"
        />
        <circle
          v-for="dot in sweep[i].dots"
          :key="`d-${dot.id}`"
          :cx="sweep[i].cursorX" :cy="dot.cy" r="2.6"
          :fill="PALETTE.trajMarkerFill" :stroke="PALETTE.trajMarkerEdge" stroke-width="0.8"
        />

      </g>

      <!-- shared play / pause control -->
      <g class="srfg-play" @pointerdown.prevent="togglePlay">
        <circle :cx="playBtn.x" :cy="playBtn.y" r="10.5" fill="#FFFFFF" stroke="#253A88" stroke-width="1.8" />
        <g v-if="playing">
          <rect :x="playBtn.x - 4" :y="playBtn.y - 4.4" width="2.8" height="8.8" rx="1" fill="#253A88" />
          <rect :x="playBtn.x + 1.4" :y="playBtn.y - 4.4" width="2.8" height="8.8" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${playBtn.x - 3} ${playBtn.y - 4.8} L ${playBtn.x + 5.2} ${playBtn.y} L ${playBtn.x - 3} ${playBtn.y + 4.8} Z`"
          fill="#253A88"
        />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.srfg-wrap {
  width: 100%;
  margin-top: 0.1rem;
}

.srfg-svg {
  display: block;
  width: 100%;
  height: auto;
}

.srfg-play {
  cursor: pointer;
}
</style>
