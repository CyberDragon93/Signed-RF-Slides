<script>
// Module-scope instance counter for unique SVG defs ids (deterministic, no randomness).
let srfgUidCounter = 0
</script>

<script setup>
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  SCHEMA, DENSITY, TWIN, PALETTE,
  signedDensity, zeroCrossings, quantileSeeds, simulateTrajectories,
} from './signedRfMath.js'

const props = defineProps({
  height: { type: Number, default: 430 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const uid = `srfg-${srfgUidCounter++}`

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---------------------------------------------------------------- panel specs
const PANEL_DEFS = [
  {
    id: 'density',
    setup: DENSITY,
    alpha: 0.85,
    title: `three-mode ${mathHtml('\\pi^+')}, centred ${mathHtml('\\pi^-')}, ${mathHtml('\\alpha=0.85')}`,
  },
  {
    id: 'schema1',
    setup: SCHEMA,
    alpha: 1.0,
    title: `single vs single, ${mathHtml('\\alpha=1')}`,
  },
  {
    id: 'twin',
    setup: TWIN,
    alpha: 0.8,
    title: `twin negative modes, ${mathHtml('\\alpha=0.8')}`,
  },
  {
    id: 'schema2',
    setup: SCHEMA,
    alpha: 2.0,
    title: `stronger suppression, ${mathHtml('\\alpha=2')}`,
  },
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

// ALL zero-boundary branches: roots of pi_t^sign = 0 per time step, grouped
// into continuous polylines by nearest-continuation (jump threshold in x);
// a root with no continuation starts a new polyline. TWIN yields two branches.
function zeroBranches(alpha, setup, nT = 140, jumpTol = 0.35) {
  const done = []
  let active = []
  for (let k = 0; k < nT; k += 1) {
    const t = 0.01 + (k / (nT - 1)) * (1.0 - 0.01)
    const roots = zeroCrossings(t, alpha, setup)
    const used = new Array(roots.length).fill(false)
    const next = []
    for (const line of active) {
      let best = -1
      let bestD = jumpTol
      for (let i = 0; i < roots.length; i += 1) {
        if (used[i]) continue
        const d = Math.abs(roots[i] - line.last)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      if (best >= 0) {
        used[best] = true
        line.pts.push([t, roots[best]])
        line.last = roots[best]
        next.push(line)
      } else {
        done.push(line.pts)
      }
    }
    for (let i = 0; i < roots.length; i += 1) {
      if (!used[i]) next.push({ pts: [[t, roots[i]]], last: roots[i] })
    }
    active = next
  }
  for (const line of active) done.push(line.pts)
  return done.filter(pts => pts.length >= 2)
}

const panelData = PANEL_DEFS.map(def => ({
  ...def,
  heatmap: renderPanelHeatmap(def.alpha, def.setup),
  branches: zeroBranches(def.alpha, def.setup, 140),
  traj: simulateTrajectories(quantileSeeds(12), def.alpha, def.setup, 320),
}))

// ---------------------------------------------------------------- layout
const CARD_W = 410
const GUT = 14
const MARGIN_X = (width - (2 * CARD_W + GUT)) / 2

const cardH = computed(() => props.height / 2 - 32)

const panels = computed(() => {
  const ch = cardH.value
  return panelData.map((p, i) => {
    const col = i % 2
    const row = i >> 1
    const cx = MARGIN_X + col * (CARD_W + GUT)
    const cy = 21 + row * (ch + GUT)
    const plotX = cx + 12
    const plotW = CARD_W - 24
    const plotY = cy + 26
    const plotH = Math.max(40, ch - 42)
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
      title: p.title,
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
      arrow: { x1: plotX + plotW - 46, x2: plotX + plotW - 20, y: plotY + plotH + 9 },
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

        <!-- title -->
        <foreignObject :x="p.cx + 12" :y="p.cy + 5" :width="CARD_W - 24" height="20" pointer-events="none">
          <div xmlns="http://www.w3.org/1999/xhtml" class="srfg-title" v-html="p.title"></div>
        </foreignObject>

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

        <!-- recessive t arrow, bottom-right -->
        <line
          :x1="p.arrow.x1" :y1="p.arrow.y" :x2="p.arrow.x2" :y2="p.arrow.y"
          stroke="#536073" stroke-width="1" stroke-opacity="0.55"
        />
        <path
          :d="`M${p.arrow.x2},${p.arrow.y - 2.6} L${p.arrow.x2 + 5},${p.arrow.y} L${p.arrow.x2},${p.arrow.y + 2.6} Z`"
          fill="#536073" fill-opacity="0.55"
        />
        <text :x="p.arrow.x2 + 10" :y="p.arrow.y + 3.5" class="srfg-taxis">t</text>
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

.srfg-title {
  color: #202124;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.5;
  white-space: nowrap;
}

.srfg-title :deep(.katex) {
  font-size: 1.05em;
}

.srfg-taxis {
  fill: #536073;
  fill-opacity: 0.8;
  font-size: 11px;
  font-style: italic;
  font-family: KaTeX_Math, "Times New Roman", serif;
}

.srfg-play {
  cursor: pointer;
}
</style>
