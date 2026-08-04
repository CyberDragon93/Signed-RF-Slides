// Signed RF 1D playground — the (t, x) anatomy of Signed RF sampling.
// Master version of the deck's "Working Example" page (RfPairEmission.vue),
// driven entirely by the exact closed-form engine in lib/signedRfMath.js.

import {
  ALPHA_DETENTS,
  DENSITY,
  PALETTE,
  SKEW,
  TWIN,
  gaussianPdf,
  quantileSeeds,
  reachFrontiers,
  signedDensity,
  simulateAdaptive,
  simulateTrajectories,
  zeroBranches,
  zeroCrossings,
} from './lib/signedRfMath.js'

// ---- Worlds ---------------------------------------------------------------
// ---- Candidate toy worlds (same Gaussian-mixture form as the engine setups) --
// comb: broad positive sheet, three narrow negative teeth. The teeth are born
// in sequence (outer pair first, centre last) and slice the flow into four
// channels; at small alpha no tooth opens at all.
const COMB = {
  plus: [{ w: 1.0, mu: 0.0, vr: 2.6 }],
  minus: [
    { w: 1 / 3, mu: -1.8, vr: 0.05 },
    { w: 1 / 3, mu: 0.0, vr: 0.05 },
    { w: 1 / 3, mu: 1.8, vr: 0.05 },
  ],
  alpha: 0.85,
  domain: [-4.5, 4.5],
}

// needle: an ultra-narrow negative spike off-centre. At small alpha it is a
// late-born lancet the flow forks around; at larger alpha its boundary sweeps
// early and shoves every trajectory to one side — a one-sided exclusion with
// a huge stranded ghost tail.
const NEEDLE = {
  plus: [{ w: 1.0, mu: -0.3, vr: 1.1 }],
  minus: [{ w: 1.0, mu: 1.1, vr: 0.015 }],
  alpha: 0.85,
  domain: [-3.8, 3.8],
}

// canyon: two far positive banks, one broad negative river between them.
// The wedge opens early and wide; the flow must commit to a bank at once.
const CANYON = {
  plus: [
    { w: 0.5, mu: -2.5, vr: 0.35 },
    { w: 0.5, mu: 2.5, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 0.0, vr: 1.1 }],
  alpha: 0.85,
  domain: [-4.6, 4.6],
}

// island: a sharp positive core inside a broad negative sea, with two shores.
// Below alpha ~ 1 the core is a reachable channel threaded between the two
// wedges; at larger alpha the sea is born first and the island splits later
// inside it — the whole core strands as ghost mass. A phase transition on
// the alpha slider.
const ISLAND = {
  plus: [
    { w: 0.30, mu: 0.0, vr: 0.06 },
    { w: 0.35, mu: -2.6, vr: 0.35 },
    { w: 0.35, mu: 2.6, vr: 0.35 },
  ],
  minus: [{ w: 1.0, mu: 0.0, vr: 1.0 }],
  alpha: 0.9,
  domain: [-4.6, 4.6],
}

const WORLDS = [
  { id: 'paper', setup: DENSITY },
  { id: 'twin', setup: TWIN },
  { id: 'skew', setup: SKEW },
  { id: 'comb', setup: COMB },
  { id: 'needle', setup: NEEDLE },
  { id: 'canyon', setup: CANYON },
  { id: 'island', setup: ISLAND },
]

// ---- Internal layout (fixed 900 x 560 coordinate system) --------------------
const W = 900
const H = 560
const panelX = 104
const panelW = 640
const panelY = 56
const panelH = 460
const panelY1 = panelY + panelH
const stripX = 22
const stripW = 70
const stripRight = stripX + stripW
const RSTRIP_X = 764
const RSTRIP_W = 104
const SWEEP = 7.0 // seconds at 1x, forward t: 0 -> 1
const HOLD = 1.6 // seconds held at t = 1
const FLASH = 0.06 // pair-production flash span in t-units

const ZONE_DARK = { reach: PALETTE.samplingDark, ghost: PALETTE.bufferDark, neg: PALETTE.negativeDark }

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const tX = t => panelX + panelW * t

function makeY(domain) {
  const [lo, hi] = domain
  const k = panelH / (hi - lo)
  return x => panelY + (hi - x) * k
}

// ---- Slice recipes (exact ports of RfPairEmission.vue) -----------------------

function frontAt(curve, t) {
  const { ts, xs } = curve
  const n = ts.length
  if (t < ts[0]) return NaN
  if (t >= ts[n - 1]) return xs[n - 1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (ts[m] <= t) lo = m
    else hi = m
  }
  const span = ts[hi] - ts[lo]
  return span > 0 ? xs[lo] + ((t - ts[lo]) / span) * (xs[hi] - xs[lo]) : xs[lo]
}

// Interpolate a zero-branch line (array of [t, x] points, ascending t) at t.
function lineAt(line, t) {
  const n = line.length
  if (t < line[0][0] || n < 2) return NaN
  if (t >= line[n - 1][0]) return line[n - 1][1]
  let lo = 0
  let hi = n - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    if (line[m][0] <= t) lo = m
    else hi = m
  }
  const span = line[hi][0] - line[lo][0]
  return span > 0 ? line[lo][1] + ((t - line[lo][0]) / span) * (line[hi][1] - line[lo][1]) : line[lo][1]
}

// Pair emissions seeded directly on the zero-set branches — topology-agnostic.
// A pair is born on the boundary; which side is the ghost (+) and which the
// negative (-) particle is decided by where each trajectory actually lands.
function buildEmissions(a, su, zeroLines) {
  const dts = zeroLines.length > 2 ? [0.16] : [0.09, 0.33]
  const eps = 0.07
  const pairs = []
  for (let k = 0; k < zeroLines.length; k += 1) {
    const line = zeroLines[k]
    if (line.length < 2) continue
    for (const dt of dts) {
      const t0 = Math.min(0.97, line[0][0] + dt)
      const xb = lineAt(line, t0)
      if (!Number.isFinite(xb)) continue
      const below = simulateAdaptive(xb - eps, t0, a, su)
      const above = simulateAdaptive(xb + eps, t0, a, su)
      const sideSign = c => Math.sign(signedDensity(c.xs[c.xs.length - 1], 1, a, su))
      const sb = sideSign(below)
      const sa = sideSign(above)
      if (sb === sa) continue // degenerate seed: both sides slid to one regime
      pairs.push({
        id: `z${k}-${dt}`,
        t: t0,
        xb,
        ghost: sb > 0 ? below : above,
        reject: sb > 0 ? above : below,
      })
    }
  }
  pairs.sort((a2, b2) => a2.t - b2.t)
  return pairs
}

// Terminal zones, robust to any topology: negative where pi_1^sign < 0;
// ghost where positive but unreachable — outside the transported span
// [reachLo, reachHi] (edges = landings of extreme source trajectories) or
// inside a validated interior-wedge frontier gap; reachable otherwise.
function buildZones1(a, su, frontiers, reachLo, reachHi) {
  const [lo, hi] = su.domain
  const gaps = frontiers.map(f => [f.left.xs[f.left.xs.length - 1], f.right.xs[f.right.xs.length - 1]])
  const typeOf = (x) => {
    if (signedDensity(x, 1, a, su) < 0) return 'neg'
    if (x < reachLo || x > reachHi) return 'ghost'
    for (const [gl, gh] of gaps) {
      if (x >= gl && x <= gh) return 'ghost'
    }
    return 'reach'
  }
  const n = 320
  const segs = []
  let cur = null
  for (let i = 0; i <= n; i += 1) {
    const x = lo + (i / n) * (hi - lo)
    const ty = typeOf(x)
    if (!cur || cur.type !== ty) {
      cur = { type: ty, x0: x, x1: x }
      segs.push(cur)
    } else {
      cur.x1 = x
    }
  }
  return segs
}

// Heatmap = the pointwise signed density, nothing else: blue where
// pi_t^sign > 0, magenta where < 0, opacity by |value|. Region structure
// (ghost/reach) is carried by the boundary-curve layers, not baked in here —
// the zone recipe silently breaks on tail-negative topologies (twin, skew).
function renderHeat(a, su) {
  const HW = 300
  const HH = 220
  const canvas = document.createElement('canvas')
  canvas.width = HW
  canvas.height = HH
  const hctx = canvas.getContext('2d')
  const [dLo, dHi] = su.domain
  const img = hctx.createImageData(HW, HH)
  const cPos = [73, 105, 226]
  const cNeg = [227, 74, 146]
  const vals = new Float64Array(HW * HH)
  let maxAbs = 1e-12
  for (let px = 0; px < HW; px += 1) {
    const t = px / (HW - 1)
    for (let py = 0; py < HH; py += 1) {
      const x = dHi - (py / (HH - 1)) * (dHi - dLo)
      const v = signedDensity(x, t, a, su)
      vals[py * HW + px] = v
      const av = Math.abs(v)
      if (av > maxAbs) maxAbs = av
    }
  }
  for (let i = 0; i < HW * HH; i += 1) {
    const v = vals[i]
    const c = v < 0 ? cNeg : cPos
    const aPix = 0.02 + 0.28 * Math.pow(Math.abs(v) / maxAbs, 0.75)
    const o = 4 * i
    img.data[o] = c[0]
    img.data[o + 1] = c[1]
    img.data[o + 2] = c[2]
    img.data[o + 3] = Math.round(255 * clamp(aPix))
  }
  hctx.putImageData(img, 0, 0)
  return canvas
}

// ---- Path builders -----------------------------------------------------------

function curvePath2D(c, y, targetPts = 220) {
  const n = c.ts.length
  const stride = Math.max(1, Math.floor(n / targetPts))
  const p = new Path2D()
  p.moveTo(tX(c.ts[0]), y(c.xs[0]))
  for (let i = stride; i < n; i += stride) p.lineTo(tX(c.ts[i]), y(c.xs[i]))
  p.lineTo(tX(c.ts[n - 1]), y(c.xs[n - 1]))
  return p
}

// ---- Slice cache: everything deterministic per (world, alpha) ------------------

const memo = new Map()

function sliceFor(wid, a) {
  const key = `${wid}|${a.toFixed(2)}`
  if (memo.has(key)) return memo.get(key)
  const su = WORLDS.find(w => w.id === wid).setup
  const y = makeY(su.domain)
  const [dLo, dHi] = su.domain

  // Interior-wedge frontiers, validated: a real wedge is NEGATIVE just inside
  // its birth roots. Tail-negative topologies (twin, skew at large alpha) make
  // reachFrontiers pair the roots across the positive bulk — discard those.
  const frontiers = reachFrontiers(a, su).filter((f) => {
    const mid = 0.5 * (f.left.xs[0] + f.right.xs[0])
    return signedDensity(mid, Math.min(f.tTip + 0.01, 1), a, su) < 0
  })
  // True reach envelope: transported images of extreme source quantiles.
  const extL = simulateAdaptive(-4.2, 0, a, su)
  const extR = simulateAdaptive(4.2, 0, a, su)
  const reachLo = extL.xs[extL.xs.length - 1]
  const reachHi = extR.xs[extR.xs.length - 1]

  const zeroLines = zeroBranches(a, su, 160)
  const transported = simulateTrajectories(quantileSeeds(17), a, su, 480)
  const pairs = buildEmissions(a, su, zeroLines)
  const zones1 = buildZones1(a, su, frontiers, reachLo, reachHi)
  const heat = renderHeat(a, su)

  // -- geometry in stage coordinates --
  const zeroPaths = zeroLines.map((line) => {
    const p = new Path2D()
    line.forEach(([t, xv], i) => (i ? p.lineTo(tX(t), y(xv)) : p.moveTo(tX(t), y(xv))))
    return p
  })
  // Ghost-boundary display: validated wedge frontiers, plus the reach
  // envelope itself whenever it converges to the panel interior (twin-style
  // worlds — for interior-wedge worlds it hugs the domain edge, so skip it).
  const edgeCut = 0.88 * Math.max(Math.abs(dLo), Math.abs(dHi))
  const frontierPaths = frontiers.flatMap(f => [curvePath2D(f.left, y, 260), curvePath2D(f.right, y, 260)])
  if (Math.abs(reachLo) < edgeCut) frontierPaths.push(curvePath2D(extL, y, 260))
  if (Math.abs(reachHi) < edgeCut) frontierPaths.push(curvePath2D(extR, y, 260))
  const { times, paths } = transported
  const trajPaths = paths.map((arr) => {
    const p = new Path2D()
    p.moveTo(tX(times[0]), y(arr[0]))
    for (let i = 3; i < arr.length; i += 3) p.lineTo(tX(times[i]), y(arr[i]))
    p.lineTo(tX(times[times.length - 1]), y(arr[arr.length - 1]))
    return p
  })
  const pairGeo = pairs.map(p => ({
    id: p.id,
    t: p.t,
    cx: tX(p.t),
    cy: y(p.xb),
    ghost: p.ghost,
    reject: p.reject,
    ghostPath: curvePath2D(p.ghost, y),
    rejectPath: curvePath2D(p.reject, y),
  }))

  // -- source strip (pi_0 = N(0,1) silhouette bulging left) --
  const srcArea = new Path2D()
  const srcLine = new Path2D()
  const srcK = 58 / 0.42
  for (let i = 0; i <= 180; i += 1) {
    const x = dLo + (i / 180) * (dHi - dLo)
    const px = stripRight - srcK * gaussianPdf(x, 0, 1)
    const py = y(x)
    if (i === 0) {
      srcLine.moveTo(px, py)
      srcArea.moveTo(stripRight, py)
    } else {
      srcLine.lineTo(px, py)
    }
    srcArea.lineTo(px, py)
  }
  srcArea.lineTo(stripRight, y(dHi))
  srcArea.closePath()

  // -- right strip: terminal signed profile per zone segment --
  let maxAbs = 1e-9
  for (let i = 0; i <= 200; i += 1) {
    const x = dLo + (i / 200) * (dHi - dLo)
    maxAbs = Math.max(maxAbs, Math.abs(signedDensity(x, 1, a, su)))
  }
  const baseX = RSTRIP_X + 34
  const rk = (RSTRIP_W - 40) / maxAbs
  const rsegs = zones1.map((seg) => {
    const line = new Path2D()
    const area = new Path2D()
    area.moveTo(baseX, y(seg.x0))
    for (let i = 0; i <= 40; i += 1) {
      const x = seg.x0 + (i / 40) * (seg.x1 - seg.x0)
      const px = baseX + rk * signedDensity(x, 1, a, su)
      const py = y(x)
      if (i === 0) line.moveTo(px, py)
      else line.lineTo(px, py)
      area.lineTo(px, py)
    }
    area.lineTo(baseX, y(seg.x1))
    area.closePath()
    return {
      type: seg.type,
      line,
      area,
      yTop: y(seg.x1),
      yBot: y(seg.x0),
      midY: y(0.5 * (seg.x0 + seg.x1)),
      span: Math.abs(y(seg.x1) - y(seg.x0)),
    }
  })
  const zoneLabels = []
  for (const ty of ['reach', 'ghost', 'neg']) {
    const cands = rsegs.filter(s => s.type === ty && s.span > 8)
    if (!cands.length) continue
    const best = cands.reduce((p, q) => (q.span > p.span ? q : p))
    zoneLabels.push({ type: ty, y: clamp(best.midY, panelY + 14, panelY1 - 12) })
  }

  // -- curve label anchors (clamped inside the panel) --
  const cxc = v => clamp(v, panelX + 6, panelX + panelW - 156)
  const cyc = v => clamp(v, panelY + 4, panelY1 - 26)
  const labels = {}
  if (zeroLines.length && zeroLines[0].length) {
    const [tz, xz] = zeroLines[0][0]
    labels.zero = { x: cxc(tX(tz) - 152), y: cyc(y(xz) - 12) }
  }
  {
    const tg = 0.78
    let gx = NaN
    if (frontiers.length) gx = frontAt(frontiers[frontiers.length - 1].right, tg)
    else if (Math.abs(reachHi) < edgeCut) gx = frontAt(extR, tg)
    if (Number.isFinite(gx)) labels.ghost = { x: cxc(tX(tg) + 8), y: cyc(y(gx) - 24) }
  }

  // -- pair-production callout anchored on the first emission --
  let callout = null
  if (pairGeo.length) {
    const p = pairGeo[0]
    callout = {
      bx: clamp(p.cx - 40, panelX + 96, panelX + panelW - 240),
      by: 30,
      mx: p.cx,
      my: p.cy,
    }
  }

  const slice = {
    setup: su,
    y,
    heat,
    frontiers,
    transported,
    geom: {
      zeroPaths,
      frontierPaths,
      trajPaths,
      pairs: pairGeo,
      srcArea,
      srcLine,
      baseX,
      rsegs,
      zoneLabels,
      labels,
      callout,
    },
  }
  memo.set(key, slice)
  return slice
}

// ---- State ----------------------------------------------------------------------

let worldId = 'paper'
let alphaSel = 0.85
const layers = { heat: true, zero: true, ghost: true, traj: true, pairs: false, strip: true, labels: false }
let slice = null

let cursor = 1
let playing = true
let manual = false
let speed = 1
let refTs = 0
let phase0 = SWEEP // hold-first: open on the complete t = 1 picture
let raf = 0
let needsDraw = false
let hiddenAt = 0

const cycleSweep = () => SWEEP / speed
const isRunning = () => playing && !manual && !document.hidden

// ---- Canvas ------------------------------------------------------------------------

const stage = document.getElementById('stage')
const canvas = document.getElementById('cv')
const ctx = canvas.getContext('2d')
let sf = 1 // device scale factor: canvas px per stage unit

function makePanelPath() {
  const p = new Path2D()
  if (p.roundRect) p.roundRect(panelX, panelY, panelW, panelH, 8)
  else p.rect(panelX, panelY, panelW, panelH)
  return p
}
const panelPath = makePanelPath()

function resizeCanvas() {
  const cssW = stage.clientWidth || 900
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const pw = Math.max(1, Math.round(cssW * dpr))
  const ph = Math.round(pw * H / W)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  sf = pw / W
}

function strokeSeg(x1, y1, x2, y2) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

// ---- Scene -----------------------------------------------------------------------

function drawScene() {
  needsDraw = false
  const g = slice.geom
  ctx.setTransform(sf, 0, 0, sf, 0, 0)
  ctx.clearRect(0, 0, W, H)
  ctx.lineJoin = 'round'

  // Source strip: pi_0
  ctx.fillStyle = 'rgba(73, 105, 226, 0.14)'
  ctx.fill(g.srcArea)
  ctx.strokeStyle = PALETTE.sampling
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.stroke(g.srcLine)
  ctx.strokeStyle = 'rgba(37, 58, 136, 0.35)'
  ctx.lineWidth = 1
  strokeSeg(stripRight, panelY, stripRight, panelY1)

  // Main (t, x) panel
  ctx.fillStyle = '#FBFCFF'
  ctx.fill(panelPath)

  ctx.save()
  ctx.clip(panelPath)

  if (layers.heat) ctx.drawImage(slice.heat, panelX, panelY, panelW, panelH)

  if (layers.ghost) {
    ctx.globalAlpha = 0.95
    ctx.strokeStyle = PALETTE.buffer
    ctx.lineWidth = 1.5
    for (const p of g.frontierPaths) ctx.stroke(p)
    ctx.globalAlpha = 1
  }
  if (layers.zero) {
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = PALETTE.negative
    ctx.lineWidth = 1.6
    for (const p of g.zeroPaths) ctx.stroke(p)
    ctx.globalAlpha = 1
  }

  const c = clamp(cursor)
  const cx = tX(c)

  // Forward-swept content: only times <= cursor t are revealed.
  ctx.save()
  ctx.beginPath()
  ctx.rect(panelX, panelY, Math.max(0, cx - panelX), panelH)
  ctx.clip()
  if (layers.traj) {
    ctx.globalAlpha = 0.5
    ctx.strokeStyle = PALETTE.traj
    ctx.lineWidth = 0.9
    for (const p of g.trajPaths) ctx.stroke(p)
    ctx.globalAlpha = 1
  }
  if (layers.pairs) {
    for (const p of g.pairs) {
      ctx.globalAlpha = 0.14
      ctx.lineWidth = 4.8
      ctx.strokeStyle = PALETTE.negative
      ctx.stroke(p.rejectPath)
      ctx.strokeStyle = PALETTE.buffer
      ctx.stroke(p.ghostPath)
      ctx.globalAlpha = 0.95
      ctx.lineWidth = 2.4
      ctx.setLineDash([2.2, 1.6])
      ctx.strokeStyle = PALETTE.negative
      ctx.stroke(p.rejectPath)
      ctx.strokeStyle = PALETTE.buffer
      ctx.stroke(p.ghostPath)
      ctx.setLineDash([])
      ctx.globalAlpha = 1
    }
  }
  ctx.restore()

  // Emission points, visible once the sweep passes them
  if (layers.pairs) {
    for (const p of g.pairs) {
      if (c < p.t) continue
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 2.9, 0, 2 * Math.PI)
      ctx.fillStyle = '#FFFFFF'
      ctx.fill()
      ctx.strokeStyle = PALETTE.negativeDark
      ctx.lineWidth = 0.9
      ctx.stroke()
    }
  }

  // Time cursor
  ctx.strokeStyle = 'rgba(32, 33, 36, 0.42)'
  ctx.lineWidth = 1.4
  ctx.setLineDash([5, 4])
  strokeSeg(cx, panelY, cx, panelY1)
  ctx.setLineDash([])

  // Pair-production flashes
  if (layers.pairs) {
    for (const p of g.pairs) {
      const d = c - p.t
      if (d <= 0 || d > FLASH) continue
      const prog = d / FLASH
      ctx.globalAlpha = 0.65 * (1 - prog)
      ctx.strokeStyle = PALETTE.negativeDark
      ctx.lineWidth = 2.4
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 5 + 22 * prog, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.strokeStyle = PALETTE.bufferDark
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(p.cx, p.cy, 3 + 15 * prog, 0, 2 * Math.PI)
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  // Particles riding forward along their exact curves
  if (layers.traj) {
    const { times, paths } = slice.transported
    const last = times.length - 1
    const idx = Math.max(0, Math.min(last, Math.round(c * last)))
    const y = slice.y
    ctx.lineWidth = 0.8
    ctx.strokeStyle = PALETTE.trajMarkerEdge
    ctx.fillStyle = PALETTE.trajMarkerFill
    for (const arr of paths) {
      ctx.beginPath()
      ctx.arc(cx, y(arr[idx]), 3.2, 0, 2 * Math.PI)
      ctx.fill()
      ctx.stroke()
    }
  }
  if (layers.pairs) {
    const y = slice.y
    ctx.font = '800 10.5px "KaTeX_Main", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const p of g.pairs) {
      if (c < p.t) continue
      const pg = [
        { xv: frontAt(p.ghost, c), fill: PALETTE.buffer, sign: '+' },
        { xv: frontAt(p.reject, c), fill: PALETTE.negative, sign: '−' },
      ]
      for (const d of pg) {
        if (!Number.isFinite(d.xv)) continue
        const py = y(d.xv)
        ctx.beginPath()
        ctx.arc(cx, py, 7, 0, 2 * Math.PI)
        ctx.fillStyle = d.fill
        ctx.fill()
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1.6
        ctx.stroke()
        ctx.fillStyle = '#FFFFFF'
        ctx.fillText(d.sign, cx, py + 0.5)
      }
    }
  }

  ctx.restore()

  // Panel border on top for a crisp edge
  ctx.strokeStyle = '#D6DDF3'
  ctx.lineWidth = 1
  ctx.stroke(panelPath)

  // Right strip: terminal signed density with zone fills + brackets
  if (layers.strip) {
    ctx.strokeStyle = 'rgba(83, 96, 115, 0.45)'
    ctx.lineWidth = 0.9
    strokeSeg(g.baseX, panelY, g.baseX, panelY1)
    for (const seg of g.rsegs) {
      ctx.globalAlpha = seg.type === 'ghost' ? 0.3 : 0.2
      ctx.fillStyle = seg.type === 'reach' ? PALETTE.sampling : seg.type === 'ghost' ? PALETTE.bufferDark : PALETTE.negative
      ctx.fill(seg.area)
      ctx.globalAlpha = 1
      ctx.strokeStyle = seg.type === 'reach' ? PALETTE.sampling : seg.type === 'ghost' ? PALETTE.buffer : PALETTE.negative
      ctx.lineWidth = 1.7
      ctx.stroke(seg.line)
    }
    // zone brackets on the right edge (annotation: labels layer)
    const bx = RSTRIP_X + RSTRIP_W - 22
    for (const seg of layers.labels ? g.rsegs : []) {
      if (seg.span <= 6) continue
      const yT = clamp(seg.yTop + 1, panelY, panelY1)
      const yB = clamp(seg.yBot - 1, panelY, panelY1)
      ctx.globalAlpha = 0.75
      ctx.strokeStyle = ZONE_DARK[seg.type]
      ctx.lineWidth = 1.2
      strokeSeg(bx, yT, bx, yB)
      strokeSeg(bx, yT, bx - 4, yT)
      strokeSeg(bx, yB, bx - 4, yB)
      ctx.globalAlpha = 1
    }
  }

  // Callout arrow: the forward reading of the boundary event
  if (layers.labels && layers.pairs && g.callout) {
    const { bx, by, mx, my } = g.callout
    const sx = bx + 30
    const sy = by + 12
    const qx = mx - 30
    const qy = (by + my) / 2 + 12
    const ex = mx - 4
    const ey = my - 12
    ctx.strokeStyle = '#202124'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.quadraticCurveTo(qx, qy, ex, ey)
    ctx.stroke()
    const ang = Math.atan2(ey - qy, ex - qx)
    ctx.fillStyle = '#202124'
    ctx.beginPath()
    ctx.moveTo(ex, ey)
    ctx.lineTo(ex - 7 * Math.cos(ang - 0.42), ey - 7 * Math.sin(ang - 0.42))
    ctx.lineTo(ex - 7 * Math.cos(ang + 0.42), ey - 7 * Math.sin(ang + 0.42))
    ctx.closePath()
    ctx.fill()
  }
}

// ---- KaTeX helpers -----------------------------------------------------------------

function mathHtml(tex) {
  if (window.katex) return window.katex.renderToString(tex, { throwOnError: false })
  return null
}

function setMath(el, tex, fallback) {
  const html = mathHtml(tex)
  if (html !== null) el.innerHTML = html
  else if (fallback !== undefined) el.textContent = fallback
}

// ---- Overlays -----------------------------------------------------------------------

const $ = id => document.getElementById(id)
const overlay = $('overlay')
const ovSrc = $('ovSrc')
const ovStripTitle = $('ovStripTitle')
const ovZero = $('ovZero')
const ovZeroChip = $('ovZeroChip')
const ovGhost = $('ovGhost')
const ovZones = $('ovZones')
const ovCallout = $('ovCallout')
const ovLegend = $('ovLegend')
const ovT0 = $('ovT0')
const ovT1 = $('ovT1')

function posPct(el, x, y) {
  el.style.left = `${(x / W * 100).toFixed(3)}%`
  el.style.top = `${(y / H * 100).toFixed(3)}%`
}

function renderStaticMath() {
  setMath(ovSrc, '\\pi_0 = \\mathcal{N}(0,1)')
  setMath(ovStripTitle, '\\pi_1^{\\mathtt{sign}}')
  const om = mathHtml('\\Omega_t^0')
  if (om !== null) ovZeroChip.innerHTML = `zero set ${om}`
  setMath(ovT0, 't = 0', 't = 0')
  setMath(ovT1, 't = 1', 't = 1')
  const omZero = mathHtml('\\Omega_t^0') || '&Omega;<sub>t</sub><sup>0</sup>'
  const pi0 = mathHtml('\\pi_0') || '&pi;&#8320;'
  ovLegend.innerHTML = [
    '<span class="lg-key"><span class="lg-chip lg-ghost">+</span>ghost particle</span>',
    '<span class="lg-key"><span class="lg-chip lg-neg">−</span>negative particle</span>',
    `<span class="lg-note">created in pairs on ${omZero} — never transported from ${pi0}</span>`,
  ].join('')
  for (const el of document.querySelectorAll('.ktx')) {
    const html = mathHtml(el.getAttribute('data-tex'))
    if (html !== null) el.innerHTML = html
  }
  updateAlphaReadout()
  lastTReadout = ''
  updateTimeUI(true)
}

const ZONE_TEX = { reach: '\\Omega^{r}', ghost: '\\Omega^{g}', neg: '\\Omega^{-}' }
const ZONE_TXT = { reach: 'Ω^r', ghost: 'Ω^g', neg: 'Ω^−' }

function updateOverlays() {
  const g = slice.geom

  // curve label chips (annotation: labels layer, default off)
  if (layers.labels && layers.zero && g.labels.zero) {
    posPct(ovZero, g.labels.zero.x, g.labels.zero.y)
    ovZero.style.display = ''
  } else {
    ovZero.style.display = 'none'
  }
  if (layers.labels && layers.ghost && g.labels.ghost) {
    posPct(ovGhost, g.labels.ghost.x, g.labels.ghost.y)
    ovGhost.style.display = ''
  } else {
    ovGhost.style.display = 'none'
  }

  // right-strip zone labels
  ovZones.innerHTML = ''
  ovStripTitle.style.display = layers.strip ? '' : 'none'
  if (layers.strip && layers.labels) {
    for (const zl of g.zoneLabels) {
      const div = document.createElement('div')
      div.className = 'ov ov-zonebox'
      const span = document.createElement('span')
      span.className = 'ov-zone'
      span.style.color = ZONE_DARK[zl.type]
      span.style.borderColor = ZONE_DARK[zl.type]
      const html = mathHtml(ZONE_TEX[zl.type])
      if (html !== null) span.innerHTML = html
      else span.textContent = ZONE_TXT[zl.type]
      div.appendChild(span)
      posPct(div, RSTRIP_X + RSTRIP_W - 18, zl.y)
      ovZones.appendChild(div)
    }
  }

  // callout + legend follow the pair-emission layer AND the labels layer
  if (layers.labels && layers.pairs && g.callout) {
    posPct(ovCallout, g.callout.bx, g.callout.by)
    ovCallout.style.display = ''
  } else {
    ovCallout.style.display = 'none'
  }
  ovLegend.style.display = layers.labels && layers.pairs ? '' : 'none'
}

// ---- Controls -------------------------------------------------------------------------

const alphaRange = $('alphaRange')
const alphaReadout = $('alphaReadout')
const alphaTicks = $('alphaTicks')
const timeRange = $('timeRange')
const timeReadout = $('timeReadout')
const playBtn = $('playBtn')

const PLAY_SVG = '<svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.4 L10.6 6 L3 10.6 Z" fill="#253A88"/></svg>'
const PAUSE_SVG = '<svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.2" y="1.6" width="2.9" height="8.8" rx="1" fill="#253A88"/><rect x="6.9" y="1.6" width="2.9" height="8.8" rx="1" fill="#253A88"/></svg>'

function setFill(input) {
  const min = parseFloat(input.min)
  const max = parseFloat(input.max)
  const v = parseFloat(input.value)
  input.style.setProperty('--fill', `${((v - min) / (max - min) * 100).toFixed(2)}%`)
}

function updateAlphaReadout() {
  const v = parseFloat(alphaRange.value)
  setMath(alphaReadout, `\\alpha = ${v.toFixed(2)}`, `α = ${v.toFixed(2)}`)
}

let lastTReadout = ''
function updateTimeUI(force) {
  const c = clamp(cursor)
  timeRange.value = String(c)
  setFill(timeRange)
  const label = c.toFixed(2)
  if (force || label !== lastTReadout) {
    lastTReadout = label
    setMath(timeReadout, `t = ${label}`, `t = ${label}`)
  }
}

function updatePlayIcon() {
  playBtn.innerHTML = playing && !manual ? PAUSE_SVG : PLAY_SVG
}

// ---- Animation loop ----------------------------------------------------------------------

function schedule() {
  if (!raf) raf = requestAnimationFrame(frame)
}

function scheduleDraw() {
  needsDraw = true
  schedule()
}

function snapshotPhase() {
  phase0 = cursor < 1 ? cycleSweep() * cursor : cycleSweep()
  refTs = 0
}

function frame(now) {
  raf = 0
  if (isRunning()) {
    if (!refTs) refTs = now
    const cs = cycleSweep()
    const ph = ((now - refTs) / 1000 + phase0) % (cs + HOLD)
    cursor = ph < cs ? ph / cs : 1
    drawScene()
    updateTimeUI()
    raf = requestAnimationFrame(frame)
  } else if (needsDraw) {
    drawScene()
    updateTimeUI()
  }
}

function restartSweep() {
  manual = false
  playing = true
  cursor = 0
  refTs = 0
  phase0 = 0
  updatePlayIcon()
  schedule()
}

// ---- Commits (debounced alpha, cached per world x alpha-0.05) --------------------------------

let alphaTimer = 0

function commitAlpha(v) {
  const a = Math.round(v * 20) / 20
  if (a === alphaSel) return
  alphaSel = a
  // Synchronous recompute (memoized): the previous slice stays painted until
  // the new one is ready, so there is no flicker.
  slice = sliceFor(worldId, alphaSel)
  updateOverlays()
  restartSweep()
  scheduleDraw()
}

function selectWorld(id) {
  if (id === worldId) return
  worldId = id
  slice = sliceFor(worldId, alphaSel)
  updateOverlays()
  restartSweep()
  scheduleDraw()
  prewarmDetents()
}

// Warm the current world's detent ladder in the background.
const prewarmed = new Set()
function prewarmDetents() {
  if (prewarmed.has(worldId)) return
  prewarmed.add(worldId)
  const wid = worldId
  const queue = ALPHA_DETENTS.filter(a => a >= 0.05 && a !== alphaSel)
    .sort((a, b) => Math.abs(a - alphaSel) - Math.abs(b - alphaSel))
  const next = () => {
    const a = queue.shift()
    if (a === undefined) return
    if (wid === worldId || memo.size < 64) sliceFor(wid, a)
    setTimeout(next, 260)
  }
  setTimeout(next, 2500)
}

// ---- Wire up ----------------------------------------------------------------------------------

function init() {
  slice = sliceFor(worldId, alphaSel)

  // world chips
  for (const btn of document.querySelectorAll('#worldChips .pg-chip')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#worldChips .pg-chip')) b.classList.toggle('on', b === btn)
      selectWorld(btn.dataset.world)
    })
  }

  // alpha slider + detent ticks
  setFill(alphaRange)
  for (const d of ALPHA_DETENTS) {
    if (d < 0.05 || d > 4) continue
    const frac = (d - 0.05) / (4 - 0.05)
    const dot = document.createElement('span')
    dot.style.left = `${(frac * 100).toFixed(2)}%`
    alphaTicks.appendChild(dot)
  }
  alphaRange.addEventListener('input', () => {
    setFill(alphaRange)
    updateAlphaReadout()
    clearTimeout(alphaTimer)
    alphaTimer = setTimeout(() => commitAlpha(parseFloat(alphaRange.value)), 120)
  })

  // layer toggles
  for (const btn of document.querySelectorAll('#layerChips .pg-toggle')) {
    btn.addEventListener('click', () => {
      const k = btn.dataset.layer
      layers[k] = !layers[k]
      btn.classList.toggle('on', layers[k])
      updateOverlays()
      scheduleDraw()
    })
  }

  // motion
  playBtn.addEventListener('click', () => {
    if (playing && !manual) {
      snapshotPhase()
      playing = false
    } else {
      manual = false
      playing = true
      snapshotPhase()
    }
    updatePlayIcon()
    schedule()
  })
  for (const btn of document.querySelectorAll('#speedChips .pg-chip')) {
    btn.addEventListener('click', () => {
      for (const b of document.querySelectorAll('#speedChips .pg-chip')) b.classList.toggle('on', b === btn)
      speed = parseFloat(btn.dataset.speed)
      snapshotPhase()
      schedule()
    })
  }
  timeRange.addEventListener('input', () => {
    manual = true // scrubbing pauses the loop until play is pressed again
    cursor = parseFloat(timeRange.value)
    snapshotPhase()
    updatePlayIcon()
    setFill(timeRange)
    scheduleDraw()
  })

  // static overlays
  posPct(ovSrc, stripX - 4, panelY - 28)
  posPct(ovStripTitle, RSTRIP_X + RSTRIP_W / 2, panelY - 28)
  posPct(ovT0, panelX, panelY1 + 8)
  posPct(ovT1, panelX + panelW, panelY1 + 8)
  posPct(ovLegend, panelX + panelW / 2, panelY1 + 26)
  renderStaticMath()
  updateOverlays()
  updatePlayIcon()

  // canvas sizing
  resizeCanvas()
  window.addEventListener('resize', () => {
    resizeCanvas()
    scheduleDraw()
  })
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      resizeCanvas()
      scheduleDraw()
    }).observe(stage)
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = performance.now()
      snapshotPhase()
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
    } else {
      scheduleDraw()
    }
  })

  scheduleDraw()
  prewarmDetents()
}

init()

// KaTeX arrives deferred from the CDN: re-render labels once it is ready.
if (!window.katex) {
  let tries = 0
  const poll = setInterval(() => {
    tries += 1
    if (window.katex) {
      clearInterval(poll)
      renderStaticMath()
      updateOverlays()
    } else if (tries > 200) {
      clearInterval(poll)
    }
  }, 50)
}

// Test hook (read-only state snapshot for the verification harness).
window.__pg1d = {
  get state() {
    return {
      worldId,
      alphaSel,
      cursor,
      playing,
      manual,
      speed,
      layers: { ...layers },
      cached: memo.size,
    }
  },
}
