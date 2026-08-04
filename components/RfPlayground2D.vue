<script>
// Module-scope background cache: the signed-density render for a given
// (world, scale) is deterministic — share it across instances and re-visits.
let pg2dUidCounter = 0
const pg2dBgMemo = new Map()
</script>

<script setup>
import katex from 'katex'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import RfFigLabel from './RfFigLabel.vue'
import { PALETTE } from './signedRfMath.js'
import {
  WORLDS_2D,
  branchVelocity2d,
  lambdaSigned2d,
  seeds2d,
  signedDensity2d,
  simulateGuidance2d,
} from './signedRf2d.js'

const props = defineProps({
  height: { type: Number, default: 470 },
  autoplay: { type: Boolean, default: true },
})

const width = 900
const uid = `pg2d-${pg2dUidCounter++}`

// ---- Worlds (paper preset library, same curation as the sweep figure) -------
const DATASETS = [
  { id: 'shared_modes', label: 'shared' },
  { id: 'ring4', label: 'ring4' },
  { id: 'unsafe_arc', label: 'arc' },
  { id: 'unsafe_sector', label: 'sector' },
  { id: 'unsafe_core', label: 'core' },
  { id: 'ring_vs_core', label: 'ring6' },
  { id: 'plus_two_minus_one', label: '2v1' },
  { id: 'plus_three_minus_one', label: '3v1' },
  { id: 'cross', label: 'cross' },
  { id: 'triangles', label: 'tri' },
  { id: 'teaser_arc3', label: 'arc3' },
  { id: 'five_negative', label: '5neg' },
  { id: 'diagonal_point', label: 'point' },
  { id: 'memo_points', label: 'memo' },
]

// ---- Palette (paper 2D recipe) ----------------------------------------------
const POS_RGB = [123, 149, 238] // #7B95EE
const NEG_RGB = [238, 116, 174] // #EE74AE
const TANH_SCALE = 0.18
const BLEND_GAMMA = 0.72
const IMAGE_ALPHA = 0.72
const PARTICLE_FILL = '#2E4FAF'
const PARTICLE_EDGE = '#D7F1FF'
const NEG_MARK = '#D7195A'
const ZOOM = 1.45

// ---- Live-stream constants ----------------------------------------------------
const N_BATCHES = 7
const BATCH_N = 110
const TRANSIT_S = 3.5 // seconds for one t: 0 -> 1 transit
const SUB_DT = 1 / 80 // max Euler step in t-units (paper grid is 1/60)
const SCALE_MAX = 5 // slider top = paper's largest sweep value
const SCALE_MIN = 0.1
const SCALE_TICKS = [0.1, 0.5, 1.0, 2.0, 5.0] // paper sweep values

// ---- Layout ---------------------------------------------------------------------
const ARENA = computed(() => {
  const y = 34
  const size = props.height - y - 26
  return { x: 24, y, w: size, h: size }
})
const RX = computed(() => ARENA.value.x + ARENA.value.w + 26)
const RW = computed(() => width - RX.value - 24)

const toggleRow = computed(() => ({ y: ARENA.value.y, h: 30 }))
const sliderRow = computed(() => ({ x: RX.value + 4, y: ARENA.value.y + 66, w: RW.value - 96 }))
const statRow = computed(() => ({ y: ARENA.value.y + 96, h: 66 }))
const chipsY = computed(() => ARENA.value.y + 192)
const controlsY = computed(() => props.height - 26)

const CHIP_H = 24
const CHIP_GAP = 7
const chipMeta = computed(() => {
  const perRow = 4
  const w = (RW.value - (perRow - 1) * CHIP_GAP) / perRow
  return DATASETS.map((d, i) => ({
    id: d.id,
    label: d.label,
    x: RX.value + (i % perRow) * (w + CHIP_GAP),
    y: chipsY.value + Math.floor(i / perRow) * (CHIP_H + CHIP_GAP),
    w,
  }))
})

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

function mathHtml(tex) {
  return katex.renderToString(tex, { throwOnError: false, output: 'html' })
}

// ---- Reactive state -----------------------------------------------------------
const datasetId = ref('shared_modes')
const rule = ref('signed') // 'signed' | 'cfg'
const scale = ref(1.0)
const playing = ref(props.autoplay)
const dragMode = ref(null)
const landed = ref(0)
const landedNeg = ref(0)

const world = computed(() => WORLDS_2D[datasetId.value])

// Square view window: bbox of all component means, padded, cropped by ZOOM —
// exactly the sweep figure's recipe.
const view = computed(() => {
  let lo = Infinity
  let hi = -Infinity
  for (const br of [world.value.plus, world.value.minus]) {
    for (const m of br.means) {
      lo = Math.min(lo, m[0], m[1])
      hi = Math.max(hi, m[0], m[1])
    }
  }
  const pad = 4 * 0.6 + 0.8
  lo -= pad
  hi += pad
  const c = 0.5 * (lo + hi)
  const half = 0.5 * (hi - lo) / ZOOM
  return { lo: c - half, hi: c + half }
})

const gridLines = computed(() => {
  const { lo, hi } = view.value
  const out = []
  for (let g = Math.ceil(lo / 2) * 2; g <= hi; g += 2) out.push((g - lo) / (hi - lo))
  return out
})

// ---- Slider mapping: quadratic in the fraction, ticks at the paper sweep ----
function fracToScale(f) {
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * f * f
}
function scaleToFrac(s) {
  return Math.sqrt(clamp((s - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)))
}

// ---- Background: signed density at t = 1, cached per (world, rounded scale) --
const bgUrl = ref('')
let bgTimer = 0

// Shared colour normalization per world, over the whole sweep range — the
// paper's recipe. Without it the tanh scale silently renormalizes as the
// slider moves and colour intensity is not comparable across strengths.
const pg2dMaxAbsMemo = new Map()
function worldMaxAbs(datasetKey) {
  if (pg2dMaxAbsMemo.has(datasetKey)) return pg2dMaxAbsMemo.get(datasetKey)
  const w2 = WORLDS_2D[datasetKey]
  const v = viewOfWorld(w2)
  const G = 72
  let maxAbs = 1e-12
  for (const a of SCALE_TICKS) {
    for (let r = 0; r < G; r += 1) {
      const y = v.lo + (r / (G - 1)) * (v.hi - v.lo)
      for (let c = 0; c < G; c += 1) {
        const x = v.lo + (c / (G - 1)) * (v.hi - v.lo)
        const d = Math.abs(signedDensity2d(x, y, 1, w2, a))
        if (d > maxAbs) maxAbs = d
      }
    }
  }
  pg2dMaxAbsMemo.set(datasetKey, maxAbs)
  return maxAbs
}

function renderBg(datasetKey, a) {
  const key = `${datasetKey}|${a.toFixed(2)}`
  if (pg2dBgMemo.has(key)) return pg2dBgMemo.get(key)
  if (typeof document === 'undefined') return ''
  const w2 = WORLDS_2D[datasetKey]
  const v = viewOfWorld(w2)
  const G = 168
  const maxAbs = worldMaxAbs(datasetKey)
  const vals = new Float64Array(G * G)
  for (let r = 0; r < G; r += 1) {
    const y = v.hi - ((r + 0.5) / G) * (v.hi - v.lo)
    for (let c = 0; c < G; c += 1) {
      const x = v.lo + ((c + 0.5) / G) * (v.hi - v.lo)
      vals[r * G + c] = signedDensity2d(x, y, 1, w2, a)
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = G
  canvas.height = G
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const img = ctx.createImageData(G, G)
  const sc = Math.max(maxAbs * TANH_SCALE, 1e-12)
  for (let i = 0; i < G * G; i += 1) {
    const strength = Math.tanh(vals[i] / sc)
    const blend = Math.pow(Math.abs(strength), BLEND_GAMMA) * IMAGE_ALPHA
    const target = strength > 0 ? POS_RGB : NEG_RGB
    const o = 4 * i
    img.data[o] = Math.round(255 * (1 - blend) + target[0] * blend)
    img.data[o + 1] = Math.round(255 * (1 - blend) + target[1] * blend)
    img.data[o + 2] = Math.round(255 * (1 - blend) + target[2] * blend)
    img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const url = canvas.toDataURL('image/png')
  pg2dBgMemo.set(key, url)
  return url
}

function viewOfWorld(w2) {
  let lo = Infinity
  let hi = -Infinity
  for (const br of [w2.plus, w2.minus]) {
    for (const m of br.means) {
      lo = Math.min(lo, m[0], m[1])
      hi = Math.max(hi, m[0], m[1])
    }
  }
  const pad = 4 * 0.6 + 0.8
  lo -= pad
  hi += pad
  const c = 0.5 * (lo + hi)
  const half = 0.5 * (hi - lo) / ZOOM
  return { lo: c - half, hi: c + half }
}

function refreshBg(immediate = false) {
  const run = () => {
    bgUrl.value = renderBg(datasetId.value, quantScale(scale.value))
  }
  if (bgTimer) clearTimeout(bgTimer)
  if (immediate) run()
  else bgTimer = setTimeout(run, 90)
}

function quantScale(s) {
  return Math.round(s * 20) / 20
}

// ---- Deterministic seed stream ---------------------------------------------------
let seedS = 77
function nextGauss2() {
  seedS = (1664525 * seedS + 1013904223) >>> 0
  const u = Math.max(seedS / 4294967296, 1e-9)
  seedS = (1664525 * seedS + 1013904223) >>> 0
  const v = seedS / 4294967296
  const r = Math.sqrt(-2 * Math.log(u))
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)]
}

// ---- Live particle batches --------------------------------------------------------
// Each batch flies t: 0 -> 1 under the CURRENT (rule, scale, world) — moving a
// control mid-flight steers particles immediately, MCMC-demo style. On arrival
// the batch stamps the landing layer, feeds the counters, and respawns.
let batches = []
// Bumped on every control change: batches spawned earlier flew part of their
// course under different parameters, so their landings are neither counted
// nor stamped — only clean full-course runs feed the statistic.
let epoch = 0

function freshBatch(delay) {
  const pos = new Float64Array(2 * BATCH_N)
  for (let i = 0; i < BATCH_N; i += 1) {
    const g = nextGauss2()
    pos[2 * i] = g[0]
    pos[2 * i + 1] = g[1]
  }
  return { pos, t: 0, delay, epoch }
}

function resetBatches() {
  batches = []
  for (let b = 0; b < N_BATCHES; b += 1) {
    batches.push(freshBatch((b * TRANSIT_S) / N_BATCHES))
  }
}

const vp = [0, 0]
const vm = [0, 0]

function advanceBatch(batch, dtT) {
  const w2 = world.value
  const isCfg = rule.value === 'cfg'
  const s = scale.value
  let remaining = dtT
  while (remaining > 1e-9 && batch.t < 1) {
    const h = Math.min(SUB_DT, remaining, 1 - batch.t)
    const t = batch.t
    const p = batch.pos
    for (let i = 0; i < BATCH_N; i += 1) {
      const x = p[2 * i]
      const y = p[2 * i + 1]
      branchVelocity2d(x, y, t, w2.plus, vp)
      branchVelocity2d(x, y, t, w2.minus, vm)
      const lam = isCfg ? s : lambdaSigned2d(x, y, t, w2, s)
      p[2 * i] = x + h * (vp[0] + lam * (vp[0] - vm[0]))
      p[2 * i + 1] = y + h * (vp[1] + lam * (vp[1] - vm[1]))
    }
    batch.t = t + h
    remaining -= h
  }
}

// ---- Canvas layers -----------------------------------------------------------------
const trailEl = ref(null)
const landEl = ref(null)
const liveEl = ref(null)
const S = 2 // supersample

function arenaClip(ctx) {
  const a = ARENA.value
  ctx.beginPath()
  ctx.rect(a.x * S, a.y * S, a.w * S, a.h * S)
  ctx.clip()
}

function toPx(x, y, out) {
  const a = ARENA.value
  const v = view.value
  out[0] = (a.x + ((x - v.lo) / (v.hi - v.lo)) * a.w) * S
  out[1] = (a.y + ((v.hi - y) / (v.hi - v.lo)) * a.h) * S
  return out
}

const px = [0, 0]

function stampLandings(batch) {
  if (batch.epoch !== epoch) return
  const ctx = landEl.value ? landEl.value.getContext('2d') : null
  const w2 = world.value
  const s = scale.value
  const n = batch.pos.length >> 1
  let neg = 0
  if (ctx) {
    ctx.save()
    arenaClip(ctx)
    for (let i = 0; i < n; i += 1) {
      const x = batch.pos[2 * i]
      const y = batch.pos[2 * i + 1]
      const isNeg = signedDensity2d(x, y, 1, w2, s) < 0
      if (isNeg) neg += 1
      toPx(x, y, px)
      if (isNeg) {
        ctx.strokeStyle = NEG_MARK
        ctx.lineWidth = 1.1 * S
        const arm = 2.6 * S
        ctx.beginPath()
        ctx.moveTo(px[0] - arm, px[1] - arm)
        ctx.lineTo(px[0] + arm, px[1] + arm)
        ctx.moveTo(px[0] - arm, px[1] + arm)
        ctx.lineTo(px[0] + arm, px[1] - arm)
        ctx.stroke()
      } else {
        ctx.fillStyle = 'rgba(46, 79, 175, 0.55)'
        ctx.beginPath()
        ctx.arc(px[0], px[1], 1.5 * S, 0, 2 * Math.PI)
        ctx.fill()
      }
    }
    ctx.restore()
  } else {
    for (let i = 0; i < n; i += 1) {
      if (signedDensity2d(batch.pos[2 * i], batch.pos[2 * i + 1], 1, w2, s) < 0) neg += 1
    }
  }
  landed.value += n
  landedNeg.value += neg
}

function fadeTrails() {
  const cv = trailEl.value
  if (!cv) return
  const ctx = cv.getContext('2d')
  const a = ARENA.value
  ctx.save()
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = 'rgba(0, 0, 0, 0.055)'
  ctx.fillRect(a.x * S, a.y * S, a.w * S, a.h * S)
  ctx.restore()
}

function drawFrame() {
  const live = liveEl.value
  const trail = trailEl.value
  if (!live || !trail) return
  const lctx = live.getContext('2d')
  const tctx = trail.getContext('2d')
  lctx.clearRect(0, 0, live.width, live.height)
  fadeTrails()
  // One Path2D per layer: a single fill + stroke instead of ~2,300 arc ops.
  const livePath = new Path2D()
  const trailPath = new Path2D()
  const r = 1.7 * S
  const tr = 0.9 * S
  for (const batch of batches) {
    if (batch.delay > 0) continue
    for (let i = 0; i < BATCH_N; i += 1) {
      toPx(batch.pos[2 * i], batch.pos[2 * i + 1], px)
      livePath.moveTo(px[0] + r, px[1])
      livePath.arc(px[0], px[1], r, 0, 2 * Math.PI)
      trailPath.moveTo(px[0] + tr, px[1])
      trailPath.arc(px[0], px[1], tr, 0, 2 * Math.PI)
    }
  }
  lctx.save()
  tctx.save()
  arenaClip(lctx)
  arenaClip(tctx)
  lctx.fillStyle = PARTICLE_FILL
  lctx.strokeStyle = PARTICLE_EDGE
  lctx.lineWidth = 0.45 * S
  lctx.fill(livePath)
  lctx.stroke(livePath)
  tctx.fillStyle = 'rgba(46, 79, 175, 0.30)'
  tctx.fill(trailPath)
  lctx.restore()
  tctx.restore()
}

// ---- Main loop -------------------------------------------------------------------
let raf = 0
let lastTs = 0
let needRedraw = true

function tick(now) {
  raf = requestAnimationFrame(tick)
  const dtWall = lastTs ? Math.min((now - lastTs) / 1000, 0.05) : 0
  lastTs = now
  if (playing.value && dtWall > 0) {
    const dtT = dtWall / TRANSIT_S
    for (const batch of batches) {
      if (batch.delay > 0) {
        batch.delay -= dtWall
        continue
      }
      advanceBatch(batch, dtT)
      if (batch.t >= 1) {
        stampLandings(batch)
        const idx = batches.indexOf(batch)
        batches[idx] = freshBatch(0)
      }
    }
    needRedraw = true
  }
  // Paused and untouched: skip rasterization entirely (also keeps the trail
  // layer from fading away under a frozen scene).
  if (needRedraw) {
    drawFrame()
    needRedraw = false
  }
}

// Slidev keeps neighboring slides mounted — halt the loop entirely while the
// figure is off-screen, resume (without a time jump) when it returns.
let visObserver = null
const wrapEl = ref(null)

function startLoop() {
  if (!raf) {
    lastTs = 0
    needRedraw = true
    raf = requestAnimationFrame(tick)
  }
}

function stopLoop() {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
}

// ---- Resets ------------------------------------------------------------------------
function clearLayers(alsoTrails = true) {
  for (const el of [landEl.value, alsoTrails ? trailEl.value : null]) {
    if (!el) continue
    const ctx = el.getContext('2d')
    ctx.clearRect(0, 0, el.width, el.height)
  }
  landed.value = 0
  landedNeg.value = 0
  needRedraw = true
}

function hardReset() {
  resetBatches()
  clearLayers(true)
  refreshBg(true)
}

function selectDataset(id) {
  if (id === datasetId.value) return
  datasetId.value = id
  hardReset()
}

function selectRule(r) {
  if (r === rule.value) return
  rule.value = r
  epoch += 1
  clearLayers(false)
}

// ---- Interaction ---------------------------------------------------------------------
function svgX(event) {
  const el = event.currentTarget
  const host = el.ownerSVGElement || el
  const rect = host.getBoundingClientRect()
  return (event.clientX - rect.left) * (width / rect.width)
}

let dragPointerId = null

function setScaleFrom(event) {
  const s = sliderRow.value
  // Every scale change taints the batches currently in flight: only runs that
  // fly their WHOLE course at one fixed strength may feed the statistic.
  epoch += 1
  scale.value = fracToScale(clamp((svgX(event) - s.x) / s.w))
  refreshBg()
}

function handleSliderDown(event) {
  dragMode.value = 'scale'
  dragPointerId = event.pointerId
  // Capture so overshooting the figure edge mid-drag neither kills nor
  // commits the gesture, and a second finger cannot hijack it.
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch { /* older engines: degrade to uncaptured drag */ }
  setScaleFrom(event)
}

function handlePointerMove(event) {
  if (dragMode.value === 'scale' && event.pointerId === dragPointerId) setScaleFrom(event)
}

function handlePointerUp(event) {
  if (dragMode.value !== 'scale' || event.pointerId !== dragPointerId) return
  // Counters at mixed strengths would lie — restart the tally at this scale.
  epoch += 1
  clearLayers(false)
  refreshBg(true)
  dragMode.value = null
  dragPointerId = null
}

function togglePlay() {
  playing.value = !playing.value
  needRedraw = true
}

// ---- Readouts --------------------------------------------------------------------------
const ruleSignedHtml = mathHtml('\\text{Signed }\\;\\lambda_t^{\\alpha}')
const ruleCfgHtml = mathHtml('\\text{Constant }\\;\\omega')
const scaleReadout = computed(() => mathHtml(
  `${rule.value === 'signed' ? '\\alpha' : '\\omega'} = ${scale.value.toFixed(2)}`,
))
const statPct = computed(() => (landed.value ? (100 * landedNeg.value) / landed.value : 0))
const statPctText = computed(() => `${statPct.value.toFixed(1)}%`)
const statSubHtml = computed(() => `of ${landed.value.toLocaleString('en-US')} landed samples in ${mathHtml('\\{\\pi_1^{\\mathtt{sign}}<0\\}')}`)

// ---- Lifecycle ---------------------------------------------------------------------------
watch([datasetId], () => refreshBg(true))

onMounted(() => {
  const isPrint = typeof window !== 'undefined' && /print/i.test(window.location.href)
  refreshBg(true)
  resetBatches()
  if (isPrint) {
    // Deterministic export: one finished signed run at the default strength.
    const frames = simulateGuidance2d(seeds2d(420), world.value, 'signed', scale.value)
    const last = frames[frames.length - 1]
    batches = [] // nothing parked at the source in the export
    landed.value = 0
    landedNeg.value = 0
    // Stamp once the canvases exist.
    setTimeout(() => {
      stampLandings({ pos: Float64Array.from(last), t: 1, epoch })
      drawFrame()
    }, 0)
    playing.value = false
    return
  }
  startLoop()
  if (typeof IntersectionObserver !== 'undefined' && wrapEl.value) {
    visObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) startLoop()
        else stopLoop()
      }
    })
    visObserver.observe(wrapEl.value)
  }
})

onUnmounted(() => {
  stopLoop()
  if (visObserver) visObserver.disconnect()
  if (bgTimer) clearTimeout(bgTimer)
})
</script>

<template>
  <div ref="wrapEl" class="pg2d-wrap">
    <svg
      class="pg2d-svg"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <!-- Arena -->
      <rect :x="ARENA.x" :y="ARENA.y" :width="ARENA.w" :height="ARENA.h" fill="#FFFFFF" />
      <image
        v-if="bgUrl"
        :x="ARENA.x" :y="ARENA.y" :width="ARENA.w" :height="ARENA.h"
        :href="bgUrl" preserveAspectRatio="none"
      />
      <g>
        <line
          v-for="(f, gi) in gridLines"
          :key="`gv-${gi}`"
          :x1="ARENA.x + f * ARENA.w" :y1="ARENA.y"
          :x2="ARENA.x + f * ARENA.w" :y2="ARENA.y + ARENA.h"
          stroke="#DFE6EF" stroke-width="0.8" stroke-opacity="0.85"
        />
        <line
          v-for="(f, gi) in gridLines"
          :key="`gh-${gi}`"
          :x1="ARENA.x" :y1="ARENA.y + (1 - f) * ARENA.h"
          :x2="ARENA.x + ARENA.w" :y2="ARENA.y + (1 - f) * ARENA.h"
          stroke="#DFE6EF" stroke-width="0.8" stroke-opacity="0.85"
        />
      </g>
      <rect :x="ARENA.x" :y="ARENA.y" :width="ARENA.w" :height="ARENA.h" fill="none" stroke="#2B2B2B" stroke-width="1.2" />

      <!-- Rule toggle -->
      <g class="pg2d-hit" @pointerdown.prevent="selectRule('signed')">
        <rect
          :x="RX" :y="toggleRow.y" :width="RW / 2 - 4" :height="toggleRow.h" rx="15"
          :fill="rule === 'signed' ? '#EAF0FF' : '#FFFFFF'"
          :stroke="rule === 'signed' ? '#253A88' : '#C9D2E8'"
          :stroke-width="rule === 'signed' ? 1.5 : 1"
        />
      </g>
      <g class="pg2d-hit" @pointerdown.prevent="selectRule('cfg')">
        <rect
          :x="RX + RW / 2 + 4" :y="toggleRow.y" :width="RW / 2 - 4" :height="toggleRow.h" rx="15"
          :fill="rule === 'cfg' ? '#EAF0FF' : '#FFFFFF'"
          :stroke="rule === 'cfg' ? '#253A88' : '#C9D2E8'"
          :stroke-width="rule === 'cfg' ? 1.5 : 1"
        />
      </g>

      <!-- Strength slider with paper-sweep ticks -->
      <g class="pg2d-slider" @pointerdown.prevent="handleSliderDown">
        <line :x1="sliderRow.x" :y1="sliderRow.y" :x2="sliderRow.x + sliderRow.w" :y2="sliderRow.y" stroke="#D6DDF3" stroke-width="8" stroke-linecap="round" />
        <line
          :x1="sliderRow.x" :y1="sliderRow.y"
          :x2="sliderRow.x + sliderRow.w * scaleToFrac(scale)" :y2="sliderRow.y"
          :stroke="PALETTE.sampling" stroke-width="8" stroke-linecap="round"
        />
        <circle
          v-for="tk in SCALE_TICKS"
          :key="`tick-${tk}`"
          :cx="sliderRow.x + sliderRow.w * scaleToFrac(tk)" :cy="sliderRow.y"
          r="2" fill="#FFFFFF" stroke="#8CA0D8" stroke-width="1"
        />
        <circle
          :cx="sliderRow.x + sliderRow.w * scaleToFrac(scale)" :cy="sliderRow.y"
          r="10" fill="#FFFFFF" :stroke="PALETTE.samplingDark" stroke-width="2.1"
        />
      </g>

      <!-- Stat card -->
      <rect
        :x="RX" :y="statRow.y" :width="RW" :height="statRow.h" rx="9"
        fill="#FBFCFF" :stroke="statPct > 0.05 ? '#E8B7CD' : '#D6DDF3'"
      />

      <!-- World chips -->
      <g v-for="m in chipMeta" :key="`ds-${m.id}`" class="pg2d-hit" @pointerdown.prevent="selectDataset(m.id)">
        <rect
          :x="m.x" :y="m.y" :width="m.w" :height="CHIP_H" rx="12"
          :fill="m.id === datasetId ? '#EAF0FF' : '#FFFFFF'"
          :stroke="m.id === datasetId ? '#253A88' : '#C9D2E8'"
          :stroke-width="m.id === datasetId ? 1.4 : 1"
        />
        <text
          :x="m.x + m.w / 2" :y="m.y + 16"
          text-anchor="middle" class="pg2d-chip-text"
          :class="{ 'pg2d-chip-text--on': m.id === datasetId }"
        >{{ m.label }}</text>
      </g>

      <!-- Play / pause + clear -->
      <g class="pg2d-hit" @pointerdown.prevent="togglePlay">
        <circle :cx="RX + 12" :cy="controlsY" r="11" fill="#FFFFFF" stroke="#253A88" stroke-width="1.9" />
        <g v-if="playing">
          <rect :x="RX + 7.8" :y="controlsY - 4.6" width="3" height="9.2" rx="1" fill="#253A88" />
          <rect :x="RX + 13.2" :y="controlsY - 4.6" width="3" height="9.2" rx="1" fill="#253A88" />
        </g>
        <path
          v-else
          :d="`M ${RX + 8.8} ${controlsY - 5} L ${RX + 17.4} ${controlsY} L ${RX + 8.8} ${controlsY + 5} Z`"
          fill="#253A88"
        />
      </g>
      <g class="pg2d-hit" @pointerdown.prevent="clearLayers(true)">
        <rect :x="RX + 34" :y="controlsY - 11" width="56" height="22" rx="11" fill="#FFFFFF" stroke="#C9D2E8" />
        <text :x="RX + 62" :y="controlsY + 4" text-anchor="middle" class="pg2d-chip-text">clear</text>
      </g>
    </svg>

    <!-- Layers: persistent trails, persistent landings, live particles -->
    <canvas ref="trailEl" class="pg2d-canvas" :width="width * S" :height="height * S"></canvas>
    <canvas ref="landEl" class="pg2d-canvas" :width="width * S" :height="height * S"></canvas>
    <canvas ref="liveEl" class="pg2d-canvas" :width="width * S" :height="height * S"></canvas>

    <!-- HTML overlays (WebKit-safe KaTeX) -->
    <RfFigLabel :x="RX" :y="toggleRow.y + 6" :w="RW / 2 - 4" :vb-h="height">
      <div class="pg2d-toggle-label" :class="{ 'pg2d-toggle-label--on': rule === 'signed' }" v-html="ruleSignedHtml"></div>
    </RfFigLabel>
    <RfFigLabel :x="RX + RW / 2 + 4" :y="toggleRow.y + 6" :w="RW / 2 - 4" :vb-h="height">
      <div class="pg2d-toggle-label" :class="{ 'pg2d-toggle-label--on': rule === 'cfg' }" v-html="ruleCfgHtml"></div>
    </RfFigLabel>
    <RfFigLabel :x="sliderRow.x + sliderRow.w + 14" :y="sliderRow.y - 12" :w="90" :vb-h="height">
      <div class="pg2d-readout" v-html="scaleReadout"></div>
    </RfFigLabel>
    <RfFigLabel :x="RX + 14" :y="statRow.y + 9" :w="RW - 28" :vb-h="height">
      <div class="pg2d-stat" :class="{ 'pg2d-stat--bad': statPct > 0.05 }">{{ statPctText }}</div>
      <div class="pg2d-stat-sub" v-html="statSubHtml"></div>
    </RfFigLabel>
    <RfFigLabel :x="RX" :y="chipsY - 20" :w="RW" :vb-h="height">
      <div class="pg2d-section">world</div>
    </RfFigLabel>
  </div>
</template>

<style scoped>
.pg2d-wrap {
  position: relative;
  width: 100%;
  margin-top: 0.1rem;
}

.pg2d-svg {
  display: block;
  width: 100%;
  height: auto;
}

.pg2d-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.pg2d-svg {
  touch-action: none;
}

.pg2d-hit,
.pg2d-slider {
  cursor: pointer;
  touch-action: none;
}

.pg2d-chip-text {
  fill: #536073;
  font-size: 11px;
  font-weight: 650;
  user-select: none;
}

.pg2d-chip-text--on {
  fill: #253a88;
}

.pg2d-toggle-label {
  color: #536073;
  font-size: 12.5px;
  font-weight: 650;
  text-align: center;
  line-height: 1.4;
  white-space: nowrap;
}

.pg2d-toggle-label--on {
  color: #253a88;
}

.pg2d-toggle-label :deep(.katex) {
  font-size: 1.05em;
}

.pg2d-readout {
  color: #253a88;
  font-size: 13px;
  font-weight: 650;
  line-height: 1.9;
  white-space: nowrap;
}

.pg2d-stat {
  color: #253a88;
  font-size: 27px;
  font-weight: 720;
  line-height: 1.05;
  font-family: KaTeX_Main, 'Latin Modern Roman', serif;
}

.pg2d-stat--bad {
  color: #d7195a;
}

.pg2d-stat-sub {
  color: #536073;
  font-size: 11.5px;
  font-weight: 600;
  margin-top: 3px;
  white-space: nowrap;
}

.pg2d-stat-sub :deep(.katex) {
  font-size: 1.05em;
}

.pg2d-section {
  color: #536073;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
</style>
