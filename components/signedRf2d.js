// Closed-form 2D Gaussian-mixture guidance dynamics.
//
// Faithful JS port of the paper's 2D figure code:
//   Negative-Rectified-Flow/paper_plot/paper_2d_fancy_core.py
//   Negative-Rectified-Flow/paper_plot/paper_2d_fancy_sweeps.py
//
// Isotropic-component GMM branches with Gaussian source N(0, I2); per-branch
// marginals, velocities, the log ratio and both guidance rules (constant CFG
// and the adaptive signed lambda) are exact. Samplers integrate the true
// Euler updates of sample_with_rule; nothing is choreographed.

// ---- Presets (PRESET_LIBRARY, sigma = 0.6 everywhere) ----------------------

function world(plusMeans, plusWeights, minusMeans, minusWeights, sigma = 0.6) {
  const norm = ws => {
    const s = ws.reduce((a, b) => a + b, 0)
    return ws.map(w => w / s)
  }
  return {
    plus: { means: plusMeans, weights: norm(plusWeights), sigmas: plusMeans.map(() => sigma) },
    minus: { means: minusMeans, weights: norm(minusWeights), sigmas: minusMeans.map(() => sigma) },
  }
}

export const WORLDS_2D = {
  shared_modes: world(
    [[-3.2, 0.2], [-1.6, 2.2], [1.2, 2.4], [3.0, 0.4], [1.8, -2.0], [-1.4, -2.3]],
    [1, 1, 1, 1, 1, 1],
    [[1.2, 2.4], [3.0, 0.4], [1.8, -2.0], [0.0, 0.2]],
    [0.23, 0.27, 0.23, 0.27],
  ),
  ring4: world(
    [[-2.0, 0.0], [2.0, 0.0], [0.0, 2.0], [0.0, -2.0]],
    [1, 1, 1, 1],
    [[2.0, 0.0], [0.0, 2.0]],
    [0.5, 0.5],
  ),
  unsafe_arc: world(
    [[-3.0, 0.0], [-2.1, 2.1], [0.0, 3.0], [2.1, 2.1], [3.0, 0.0], [2.1, -2.1], [0.0, -3.0], [-2.1, -2.1]],
    [1, 1, 1, 1, 1, 1, 1, 1],
    [[2.1, 2.1], [3.0, 0.0], [2.1, -2.1]],
    [0.30, 0.40, 0.30],
  ),
  unsafe_sector: world(
    [[-3.0, 1.5], [-2.2, -1.6], [-0.4, 2.3], [0.0, 0.0], [1.7, -2.2], [2.4, 1.8], [3.2, -0.1]],
    [1, 1, 1, 1, 1, 1, 1],
    [[2.4, 1.8], [3.2, -0.1], [1.7, -2.2]],
    [0.40, 0.35, 0.25],
  ),
}

// Sweep values and integration constants, exactly as in the paper script.
export const SWEEP_VALUES_2D = [0.1, 0.5, 1.0, 2.0, 5.0]
export const N_STEPS_2D = 60
const LOG_R_CLIP = 30.0
const DENOM_MIN_ABS = 1e-3
const DENOM_EPS = 1e-6
const LAMBDA_CLIP = 20.0

// ---- Branch quantities -----------------------------------------------------

// log p_t and velocity of one GMM branch at (x, y, t); the velocity uses the
// posterior-weighted per-component drift (t s^2 - (1 - t)) / var_t.
export function branchLogp2d(x, y, t, br) {
  const { means, weights, sigmas } = br
  let mx = -Infinity
  const logs = new Array(means.length)
  for (let k = 0; k < means.length; k += 1) {
    const vr = (1 - t) * (1 - t) + t * t * sigmas[k] * sigmas[k]
    const dx = x - t * means[k][0]
    const dy = y - t * means[k][1]
    const l = Math.log(weights[k]) - 0.5 * ((dx * dx + dy * dy) / vr) - Math.log(2 * Math.PI * vr)
    logs[k] = l
    if (l > mx) mx = l
  }
  let s = 0
  for (const l of logs) s += Math.exp(l - mx)
  return mx + Math.log(s)
}

export function branchVelocity2d(x, y, t, br, out) {
  const { means, weights, sigmas } = br
  let mx = -Infinity
  const logs = new Array(means.length)
  for (let k = 0; k < means.length; k += 1) {
    const vr = (1 - t) * (1 - t) + t * t * sigmas[k] * sigmas[k]
    const dx = x - t * means[k][0]
    const dy = y - t * means[k][1]
    const l = Math.log(weights[k]) - 0.5 * ((dx * dx + dy * dy) / vr) - Math.log(2 * Math.PI * vr)
    logs[k] = l
    if (l > mx) mx = l
  }
  let den = 0
  let vx = 0
  let vy = 0
  for (let k = 0; k < means.length; k += 1) {
    const g = Math.exp(logs[k] - mx)
    const s2 = sigmas[k] * sigmas[k]
    const vr = (1 - t) * (1 - t) + t * t * s2
    const coeff = (t * s2 - (1 - t)) / vr
    vx += g * (means[k][0] + coeff * (x - t * means[k][0]))
    vy += g * (means[k][1] + coeff * (y - t * means[k][1]))
    den += g
  }
  out[0] = vx / den
  out[1] = vy / den
  return out
}

export function signedDensity2d(x, y, t, w, a) {
  return (1 + a) * Math.exp(branchLogp2d(x, y, t, w.plus)) - a * Math.exp(branchLogp2d(x, y, t, w.minus))
}

// Adaptive signed guidance scale from the log ratio (paper's clamping chain).
export function lambdaSigned2d(x, y, t, w, a) {
  let logR = branchLogp2d(x, y, t, w.minus) - branchLogp2d(x, y, t, w.plus)
  if (!Number.isFinite(logR)) logR = 0
  logR = Math.max(-LOG_R_CLIP, Math.min(LOG_R_CLIP, logR))
  const r = Math.exp(logR)
  const denom = Math.max((1 + a) - a * r, DENOM_MIN_ABS)
  let lam = (a * r) / (denom + DENOM_EPS)
  if (!Number.isFinite(lam)) lam = 0
  return Math.max(0, Math.min(LAMBDA_CLIP, lam))
}

// ---- Sampler ----------------------------------------------------------------
// Euler integration of x += dt (v+ + lambda (v+ - v-)) from shared seeds;
// records every step so the demo can scrub time. mode: 'cfg' | 'signed'.
export function simulateGuidance2d(seeds, w, mode, scale, nSteps = N_STEPS_2D) {
  const n = seeds.length
  const dt = 1 / nSteps
  const frames = new Array(nSteps + 1)
  const cur = new Float64Array(n * 2)
  for (let i = 0; i < n; i += 1) {
    cur[2 * i] = seeds[i][0]
    cur[2 * i + 1] = seeds[i][1]
  }
  frames[0] = Float32Array.from(cur)
  const vp = [0, 0]
  const vm = [0, 0]
  for (let k = 0; k < nSteps; k += 1) {
    const t = k / nSteps
    for (let i = 0; i < n; i += 1) {
      const x = cur[2 * i]
      const y = cur[2 * i + 1]
      branchVelocity2d(x, y, t, w.plus, vp)
      branchVelocity2d(x, y, t, w.minus, vm)
      const lam = mode === 'cfg' ? scale : lambdaSigned2d(x, y, t, w, scale)
      cur[2 * i] = x + dt * (vp[0] + lam * (vp[0] - vm[0]))
      cur[2 * i + 1] = y + dt * (vp[1] + lam * (vp[1] - vm[1]))
    }
    frames[k + 1] = Float32Array.from(cur)
  }
  return frames
}

// Deterministic shared seeds (LCG + Box-Muller), same across all panels.
export function seeds2d(n, seed = 1234) {
  let s = seed >>> 0
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0
    return s / 4294967296
  }
  const out = []
  for (let i = 0; i < n; i += 1) {
    const u = Math.max(rand(), 1e-9)
    const v = rand()
    const r = Math.sqrt(-2 * Math.log(u))
    out.push([r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)])
  }
  return out
}
