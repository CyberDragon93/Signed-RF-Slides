// Signed RF · 2D playground — the paper's live two-row guidance sweep.
// Standalone master of components/Rf2DGuidance.vue: identical numeric recipe,
// ported out of Vue onto one dpr-aware canvas + HTML title overlays.

import {
  N_STEPS_2D,
  SWEEP_VALUES_2D,
  WORLDS_2D,
  seeds2d,
  signedDensity2d,
  simulateGuidance2d,
} from './lib/signedRf2d.js'

// ---- Datasets: the paper's full preset library ------------------------------
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

const N_PARTICLES = 260
// Broad single-Gaussian toys read better with a denser cloud.
const PARTICLE_COUNTS = { diagonal_point: 520, memo_points: 520 }
const SWEEP = 7.0
const HOLD = 2.2
const CYCLE = SWEEP + HOLD

// Paper palette (paper_2d_fancy_sweeps, cool_ultramarine_hot_magenta_soft).
const POS_RGB = [123, 149, 238] // #7B95EE
const NEG_RGB = [238, 116, 174] // #EE74AE
const TANH_SCALE = 0.18
const BLEND_GAMMA = 0.72
const IMAGE_ALPHA = 0.72
const PARTICLE_FILL = '#2E4FAF'
const PARTICLE_EDGE = '#D7F1FF'
const NEG_MARK = '#D7195A'
const ZOOM = 1.45
const GRID_STROKE = '#DFE6EF'
const PANEL_BORDER = '#2B2B2B'

// ---- Layout (internal fixed coordinate system) -------------------------------
const WIDTH = 900
const COLS = SWEEP_VALUES_2D.length
const GAP = 8
const MARGIN_X = 24
const PANEL = (WIDTH - 2 * MARGIN_X - (COLS - 1) * GAP) / COLS // ~164
const TITLE_H = 22
const ROW0_Y = 30
const ROW_STRIDE = PANEL + TITLE_H + 10
const HEIGHT = ROW0_Y + ROW_STRIDE + PANEL + 16 // 406

function panelRect(row, col) {
  return {
    x: MARGIN_X + col * (PANEL + GAP),
    y: ROW0_Y + row * ROW_STRIDE,
    w: PANEL,
    h: PANEL,
  }
}

function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v))
}

// ---- Per-dataset slice ---------------------------------------------------------
// View window: square bbox of all component means padded, then zoomed in by the
// paper's SWEEP_ZOOM (crop about the centre).
function viewOf(w2) {
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

// Background canvas for one panel: signed density at t = 1, paper recipe.
function renderPanelBg(w2, a, view, maxAbs) {
  const G = 132
  const canvas = document.createElement('canvas')
  canvas.width = G
  canvas.height = G
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(G, G)
  const scale = Math.max(maxAbs * TANH_SCALE, 1e-12)
  for (let r = 0; r < G; r += 1) {
    const y = view.hi - ((r + 0.5) / G) * (view.hi - view.lo)
    for (let c = 0; c < G; c += 1) {
      const x = view.lo + ((c + 0.5) / G) * (view.hi - view.lo)
      const d = signedDensity2d(x, y, 1, w2, a)
      const strength = Math.tanh(d / scale)
      const blend = Math.pow(Math.abs(strength), BLEND_GAMMA) * IMAGE_ALPHA
      const target = strength > 0 ? POS_RGB : NEG_RGB
      const o = 4 * (r * G + c)
      img.data[o] = Math.round(255 * (1 - blend) + target[0] * blend)
      img.data[o + 1] = Math.round(255 * (1 - blend) + target[1] * blend)
      img.data[o + 2] = Math.round(255 * (1 - blend) + target[2] * blend)
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

function buildSlice(datasetId) {
  const w2 = WORLDS_2D[datasetId]
  const view = viewOf(w2)
  const nP = PARTICLE_COUNTS[datasetId] || N_PARTICLES
  const seeds = seeds2d(nP)

  // Shared colour normalization across every panel of the figure, as in the
  // paper: max |signed density| over all sweep values on the view grid.
  let maxAbs = 1e-12
  const G = 72
  for (const a of SWEEP_VALUES_2D) {
    for (let r = 0; r < G; r += 1) {
      const y = view.lo + (r / (G - 1)) * (view.hi - view.lo)
      for (let c = 0; c < G; c += 1) {
        const x = view.lo + (c / (G - 1)) * (view.hi - view.lo)
        const d = Math.abs(signedDensity2d(x, y, 1, w2, a))
        if (d > maxAbs) maxAbs = d
      }
    }
  }

  const panels = []
  for (let row = 0; row < 2; row += 1) {
    const mode = row === 0 ? 'cfg' : 'signed'
    for (let col = 0; col < COLS; col += 1) {
      const s = SWEEP_VALUES_2D[col]
      const frames = simulateGuidance2d(seeds, w2, mode, s)
      const last = frames[frames.length - 1]
      const negMask = new Uint8Array(nP)
      for (let i = 0; i < nP; i += 1) {
        if (signedDensity2d(last[2 * i], last[2 * i + 1], 1, w2, s) < 0) negMask[i] = 1
      }
      panels.push({
        row,
        col,
        mode,
        scale: s,
        frames,
        negMask,
        bg: renderPanelBg(w2, s, view, maxAbs),
      })
    }
  }

  // Grid line fractions: world-unit lines every 2 units inside the view.
  const gridFracs = []
  for (let g = Math.ceil(view.lo / 2) * 2; g <= view.hi; g += 2) {
    gridFracs.push((g - view.lo) / (view.hi - view.lo))
  }
  return { view, panels, gridFracs }
}

const sliceCache = new Map()
function sliceFor(datasetId) {
  if (!sliceCache.has(datasetId)) sliceCache.set(datasetId, buildSlice(datasetId))
  return sliceCache.get(datasetId)
}

// ---- DOM -----------------------------------------------------------------------
const stage = document.getElementById('stage')
const cv = document.getElementById('cv')
const titlesEl = document.getElementById('titles')
const worldChipsEl = document.getElementById('worldChips')
const displayChipsEl = document.getElementById('displayChips')
const speedChipsEl = document.getElementById('speedChips')
const playBtn = document.getElementById('playBtn')
const timeSlider = document.getElementById('timeSlider')
const timeReadout = document.getElementById('timeReadout')

// ---- State -----------------------------------------------------------------------
let datasetId = 'shared_modes'
let cursor = 1
let playing = true
let manual = false
let speed = 1
let phase = SWEEP // hold-first: open on the finished sweep
let lastTs = 0
let raf = 0
let dirty = true
const show = { bg: true, grid: true, marks: true }

function isRunning() {
  return playing && !manual && !document.hidden
}

// ---- KaTeX helpers -----------------------------------------------------------------
function whenKatex(cb) {
  if (window.katex) {
    cb()
    return
  }
  const iv = setInterval(() => {
    if (window.katex) {
      clearInterval(iv)
      cb()
    }
  }, 50)
  setTimeout(() => clearInterval(iv), 12000)
}

function mathHtml(tex) {
  return window.katex
    ? window.katex.renderToString(tex, { throwOnError: false })
    : tex
}

const readoutCache = new Map()
function readoutHtml(c) {
  const key = c.toFixed(2)
  if (!window.katex) return `t = ${key}`
  if (!readoutCache.has(key)) {
    readoutCache.set(key, mathHtml(`t = ${key}`))
  }
  return readoutCache.get(key)
}

// ---- Panel titles (static overlay: sweep values never change) -----------------------
function buildTitles() {
  titlesEl.innerHTML = ''
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const s = SWEEP_VALUES_2D[col]
      const rect = panelRect(row, col)
      const div = document.createElement('div')
      div.className = 'g2d-title'
      div.style.left = `${(rect.x / WIDTH) * 100}%`
      div.style.top = `${((rect.y - 24) / HEIGHT) * 100}%`
      div.style.width = `${(rect.w / WIDTH) * 100}%`
      div.style.height = `${(20 / HEIGHT) * 100}%`
      div.innerHTML = row === 0
        ? `Constant&nbsp;${mathHtml(`\\omega=${s.toFixed(1)}`)}`
        : `Ours&nbsp;${mathHtml(`\\alpha=${s.toFixed(1)}`)}`
      titlesEl.appendChild(div)
    }
  }
}

// ---- Canvas sizing -----------------------------------------------------------------
function resize() {
  const cwCss = stage.clientWidth
  if (!cwCss) return
  const ss = Math.min(2, window.devicePixelRatio || 1)
  const w = Math.round(cwCss * ss)
  const h = Math.round(cwCss * ss * (HEIGHT / WIDTH))
  if (cv.width !== w || cv.height !== h) {
    cv.width = w
    cv.height = h
  }
  titlesEl.style.fontSize = `${(12.5 * cwCss / WIDTH).toFixed(2)}px`
  invalidate()
}

// ---- Drawing ------------------------------------------------------------------------
function draw() {
  const ctx = cv.getContext('2d')
  const k = cv.width / WIDTH
  ctx.setTransform(k, 0, 0, k, 0, 0)
  ctx.clearRect(0, 0, WIDTH, HEIGHT)
  const { view, panels, gridFracs } = sliceFor(datasetId)
  const c = clamp(cursor)
  const fpos = c * N_STEPS_2D
  const k0 = Math.min(N_STEPS_2D - 1, Math.floor(fpos))
  const fr = fpos - k0
  const showNeg = show.marks && c > 0.985

  for (const p of panels) {
    const rect = panelRect(p.row, p.col)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
    if (show.bg) {
      ctx.drawImage(p.bg, rect.x, rect.y, rect.w, rect.h)
    }
    if (show.grid) {
      ctx.strokeStyle = GRID_STROKE
      ctx.lineWidth = 0.7
      ctx.globalAlpha = 0.85
      ctx.beginPath()
      for (const f of gridFracs) {
        const gx = rect.x + f * rect.w
        ctx.moveTo(gx, rect.y)
        ctx.lineTo(gx, rect.y + rect.h)
        const gy = rect.y + (1 - f) * rect.h
        ctx.moveTo(rect.x, gy)
        ctx.lineTo(rect.x + rect.w, gy)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }
    ctx.strokeStyle = PANEL_BORDER
    ctx.lineWidth = 1.15
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)

    // Particles + violation marks, clipped to the panel.
    const A = p.frames[k0]
    const B = p.frames[k0 + 1]
    const sx = x => rect.x + ((x - view.lo) / (view.hi - view.lo)) * rect.w
    const sy = y => rect.y + ((view.hi - y) / (view.hi - view.lo)) * rect.h
    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.w, rect.h)
    ctx.clip()
    ctx.lineWidth = 0.42
    ctx.strokeStyle = PARTICLE_EDGE
    ctx.fillStyle = PARTICLE_FILL
    const r = 1.55
    const nP = A.length >> 1
    for (let i = 0; i < nP; i += 1) {
      const x = A[2 * i] + (B[2 * i] - A[2 * i]) * fr
      const y = A[2 * i + 1] + (B[2 * i + 1] - A[2 * i + 1]) * fr
      ctx.beginPath()
      ctx.arc(sx(x), sy(y), r, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
    }
    if (showNeg) {
      ctx.strokeStyle = NEG_MARK
      ctx.lineWidth = 0.85
      const arm = 2.4
      const F = p.frames[N_STEPS_2D]
      const nF = F.length >> 1
      for (let i = 0; i < nF; i += 1) {
        if (!p.negMask[i]) continue
        const px = sx(F[2 * i])
        const py = sy(F[2 * i + 1])
        ctx.beginPath()
        ctx.moveTo(px - arm, py - arm)
        ctx.lineTo(px + arm, py + arm)
        ctx.moveTo(px - arm, py + arm)
        ctx.lineTo(px + arm, py - arm)
        ctx.stroke()
      }
    }
    ctx.restore()
  }
}

// ---- Time UI ---------------------------------------------------------------------------
function updateTimeUI() {
  const c = clamp(cursor)
  timeSlider.value = String(Math.round(c * 1000))
  timeSlider.style.setProperty('--fill', `${(c * 100).toFixed(1)}%`)
  timeReadout.innerHTML = readoutHtml(c)
}

const PLAY_ICON = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M 2.4 1 L 11 6 L 2.4 11 Z" fill="#253A88"/></svg>'
const PAUSE_ICON = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.6" y="1.2" width="3.2" height="9.6" rx="1" fill="#253A88"/><rect x="7.2" y="1.2" width="3.2" height="9.6" rx="1" fill="#253A88"/></svg>'

function updatePlayBtn() {
  playBtn.innerHTML = playing && !manual ? PAUSE_ICON : PLAY_ICON
}

// ---- Animation loop -----------------------------------------------------------------------
function tick(ts) {
  raf = 0
  if (isRunning()) {
    if (lastTs) phase = (phase + ((ts - lastTs) / 1000) * speed) % CYCLE
    lastTs = ts
    cursor = phase < SWEEP ? phase / SWEEP : 1
    dirty = true
  } else {
    lastTs = 0
  }
  if (dirty) {
    dirty = false
    draw()
    updateTimeUI()
  }
  if (isRunning()) schedule()
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(tick)
}

function invalidate() {
  dirty = true
  schedule()
}

// ---- Controls --------------------------------------------------------------------------------
function selectDataset(id) {
  if (id === datasetId) return
  datasetId = id
  for (const btn of worldChipsEl.children) {
    btn.classList.toggle('on', btn.dataset.id === id)
  }
  // restart the sweep: nothing is mid-flight at t = 0, so the swap is clean
  manual = false
  playing = true
  cursor = 0
  phase = 0
  lastTs = 0
  updatePlayBtn()
  invalidate()
  prewarm()
}

for (const d of DATASETS) {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'pg-chip'
  btn.dataset.id = d.id
  btn.textContent = d.label
  if (d.id === datasetId) btn.classList.add('on')
  btn.addEventListener('click', () => selectDataset(d.id))
  worldChipsEl.appendChild(btn)
}

for (const btn of displayChipsEl.querySelectorAll('.pg-toggle')) {
  btn.addEventListener('click', () => {
    const layer = btn.dataset.layer
    show[layer] = !show[layer]
    btn.classList.toggle('on', show[layer])
    invalidate()
  })
}

for (const btn of speedChipsEl.querySelectorAll('.pg-chip')) {
  btn.addEventListener('click', () => {
    speed = Number(btn.dataset.speed)
    for (const b of speedChipsEl.children) b.classList.toggle('on', b === btn)
  })
}

playBtn.addEventListener('click', () => {
  if (playing && !manual) {
    playing = false
  } else {
    manual = false
    playing = true
    lastTs = 0
  }
  updatePlayBtn()
  invalidate()
})

// Scrubbing pauses until play; grabbing the thumb alone already pauses.
timeSlider.addEventListener('pointerdown', () => {
  manual = true
  updatePlayBtn()
})
timeSlider.addEventListener('input', () => {
  manual = true
  cursor = clamp(Number(timeSlider.value) / 1000)
  phase = SWEEP * cursor
  updatePlayBtn()
  invalidate()
})

document.addEventListener('visibilitychange', () => {
  lastTs = 0
  if (!document.hidden) invalidate()
})

window.addEventListener('resize', resize)

// ---- Prewarm the other datasets in the background --------------------------------------------
let prewarmed = false
function prewarm() {
  if (prewarmed) return
  prewarmed = true
  const queue = DATASETS.map(d => d.id).filter(id => id !== datasetId)
  const next = () => {
    const id = queue.shift()
    if (!id) return
    sliceFor(id)
    setTimeout(next, 250)
  }
  setTimeout(next, 2500)
}

// ---- Boot --------------------------------------------------------------------------------------
whenKatex(() => {
  buildTitles()
  // Re-render caption math + the readout once KaTeX is live.
  for (const el of document.querySelectorAll('.pg-caption [data-tex]')) {
    el.innerHTML = mathHtml(el.dataset.tex)
  }
  updateTimeUI()
})

buildTitles() // plain-text fallback until KaTeX loads
updatePlayBtn()
resize()
sliceFor(datasetId)
updateTimeUI()
schedule()
prewarm()
