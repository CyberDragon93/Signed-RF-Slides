---
theme: scholarly
title: Signed Rectified Flow
info: |
  Slides following the method development of "Signed Rectified Flow: Negativity Controlled Generation".
footerMiddle: Signed Rectified Flow
footerLeft: Qiang Liu
aspectRatio: 4/3
lang: en
themeConfig:
  colorTheme: classic-blue
  fontTheme: contemporary
  colorMode: dark
  outlineToc: true
  outlineTocOpen: false
---

# Signed Rectified Flow

Negativity Controlled Generation

<div class="author-section mt-12">
  <div class="author-name text-xl">Qiang Liu</div>
  <div class="author-institution text-lg mt-2 opacity-80">UT Austin</div>
  <div class="author-email text-base mt-1 opacity-70">
    <a href="https://www.cs.utexas.edu/~lqiang/index.html">qiang.liu.research@gmail.com</a>
  </div>
</div>

---
layout: intro
---

# Rectified Flow

https://arxiv.org/pdf/2209.03003 

Flow Straight and Fast: Learning to Generate and Transfer Data with Rectified Flow

---

# Rectified Flow in a Nutshell

<Rf1DFlow mode="coupling" :height="340" autoplay />

<div style="height: 1.2rem"></div>

- **Coupling**: Sample a noise-data pair $X_0 \sim \pi_0,\; X_1 \sim \pi_1$.

- **Interpolation**: Connect each random pair by the straight path

$$
X_t=(1-t)X_0+tX_1,\qquad t\in[0,1].
$$

---

# Rectified Flow in a Nutshell

<Rf1DFlow mode="conditional" :height="340" autoplay />

- **Causalization**: Convert interpolation into a causal ODE $\dot Z_t = v_t^{\text{RF}}(Z_t)$ by minimizing

  $$
  \min_v
  \int_0^1
  \mathbb{E}_{(X_0,X_1)}
  \left[
    \left\|
      \dot X_t - v_t(X_t)
    \right\|^2
  \right] \mathrm dt,
  $$

  where $\dot X_t=X_1-X_0$ is the line direction and the optimum is the conditional average $v_t^{*}(x)=\mathbb{E}[X_1-X_0\mid X_t=x]$.

---

# Marginal Preservation

The key RF property is marginal preservation:

$$
Z_0 \sim \pi_0
\quad\Longrightarrow\quad
Z_t \sim \pi_t
\quad\text{for all }t\in[0,1].
$$

In particular,

$$
Z_1 \sim \pi_1.
$$

So RF turns a source distribution into the target distribution through a deterministic ODE.

---

# Training Objective

In practice, the optimal velocity is approximated by a neural network $v_t^\theta$ trained with

$$
\mathcal{L}(\theta)
 =
\int_0^1
\mathbb{E}
\left[
  \left\|
    v_t^\theta(X_t) - (X_1-X_0)
  \right\|^2
\right]
dt.
$$

This is the standard RF baseline that the paper extends.

---
layout: intro
---

# RF For Convex Mixtures

Now introduce positive and negative targets, but keep the mixture probabilistic.

---

# Convex Mixture Target

For two target distributions $\pi_1^+$ and $\pi_1^-$, define

$$
\pi_1^{\text{mix}}
  =
  (1-w)\pi_1^+ + w\pi_1^-,
  \qquad w\in[0,1].
$$

Each branch has its own RF marginal and velocity:

$$
(\pi_t^+, v_t^+),\qquad (\pi_t^-, v_t^-).
$$

The common source is still $\pi_0$.

---

# Linearity Of Marginal And Flux

RF marginals and momentum fields are linear in the terminal distribution.

For the convex mixture:

$$
\pi_t^{\text{mix}}
 =
 (1-w)\pi_t^+ + w\pi_t^-.
$$

The corresponding flux is

$$
m_t^{\text{mix}}
 =
 (1-w)\pi_t^+ v_t^+
 +
 w\pi_t^- v_t^-.
$$

---

# Mixture Velocity

Divide flux by density:

$$
v_t^{\text{RF}}(x)
 =
 \frac{
   (1-w)\pi_t^+(x)v_t^+(x)
   +
   w\pi_t^-(x)v_t^-(x)
 }{
   (1-w)\pi_t^+(x)
   +
   w\pi_t^-(x)
 }.
$$

For $w\in[0,1]$, the denominator is a valid probability marginal.

Solving the RF ODE recovers

$$
Z_t \sim \pi_t^{\text{mix}},\qquad Z_1\sim\pi_1^{\text{mix}}.
$$

---

# The Paper's Turn

For convex mixtures, everything remains nonnegative.

The paper then asks:

> What happens if the mixture weight is allowed to be negative?

This is the step from mixture modeling to negative information.

---
layout: intro
---

# Signed Mixtures

Take the same RF formula, but extrapolate beyond convexity.

---

# Signed Target

Set

$$
w=-\alpha,\qquad \alpha>0.
$$

Then the terminal target becomes

$$
\pi_1^{\text{sign}}(x)
 =
 (1+\alpha)\pi_1^+(x)
 -
 \alpha \pi_1^-(x).
$$

It has total mass one, but it may take negative values.

---

# Signed Marginal

By the same linearity,

$$
\pi_t^{\text{sign}}(x)
 =
 (1+\alpha)\pi_t^+(x)
 -
 \alpha\pi_t^-(x).
$$

The positive, zero, and negative regions are

$$
\Omega_t^+ = \{x:\pi_t^{\text{sign}}(x)>0\},
\quad
\Omega_t^0 = \{x:\pi_t^{\text{sign}}(x)=0\},
\quad
\Omega_t^- = \{x:\pi_t^{\text{sign}}(x)<0\}.
$$

---

# Signed RF Velocity

Applying the convex-mixture RF formula with $w=-\alpha$ gives

$$
v_t^{\text{signRF}}(x)
 =
 \frac{
   (1+\alpha)\pi_t^+(x)v_t^+(x)
   -
   \alpha\pi_t^-(x)v_t^-(x)
 }{
   (1+\alpha)\pi_t^+(x)
   -
   \alpha\pi_t^-(x)
 }.
$$

The denominator is exactly $\pi_t^{\text{sign}}(x)$.

---

# The Singularity Is The Boundary

The velocity is defined away from the zero set

$$
\Omega_t^0=\{x:\pi_t^{\text{sign}}(x)=0\}.
$$

Starting from

$$
Z_0\sim\pi_0^{\text{sign}} = (1+\alpha)\pi_0-\alpha\pi_0=\pi_0,
$$

the sampler follows

$$
\dot Z_t = v_t^{\text{signRF}}(Z_t).
$$

The paper's claim is that source-initialized trajectories remain on the positive side and are repelled from the zero set.

---
layout: intro
---

# What Does It Sample?

The signed density is not itself a probability law, but the ODE trajectory law is.

---

# Valid Law Vs Signed Density

Let $\pi_t^{\text{signRF}}$ denote the law of the source-initialized trajectory $Z_t$.

Two facts now coexist:

$$
\pi_t^{\text{signRF}}
\quad\text{is a valid probability distribution,}
$$

but

$$
\pi_t^{\text{sign}}
\quad\text{may be negative.}
$$

Therefore the two objects must diverge once negative regions appear.

---

# Region Decomposition

Signed RF partitions the positive and negative geometry into three regions.

$$
\Omega_t^r
 =
 \operatorname{supp}(\pi_t^{\text{signRF}})
\subseteq
\Omega_t^+
$$

is the reachable region.

The negative region is

$$
\Omega_t^-=\{x:\pi_t^{\text{sign}}(x)<0\}.
$$

The unreached positive part is the ghost region:

$$
\Omega_t^g = \Omega_t^+ \setminus \Omega_t^r.
$$

---

# Rectifying The Signed Density

On the reachable region, the sampled density equals the signed density:

$$
\pi_t^{\text{signRF}}(x)
 =
\pi_t^{\text{sign}}(x)\mathbf{1}\{x\in\Omega_t^r\}.
$$

So Signed RF does not normalize the positive part globally.

It keeps exactly the signed density on the part reachable from the source, and zeros out the rest.

---

# Ghost Mass Cancels Negative Mass

Both $\pi_t^{\text{signRF}}$ and $\pi_t^{\text{sign}}$ integrate to one.

Since $\pi_t^{\text{signRF}}=\pi_t^{\text{sign}}$ on $\Omega_t^r$,

$$
\int_{\Omega_t^g}\pi_t^{\text{sign}}(x)\,dx
+
\int_{\Omega_t^-}\pi_t^{\text{sign}}(x)\,dx
=0.
$$

The ghost region carries leftover positive mass that exactly cancels the rejected negative mass.

---

# Physical Picture

Trace the dynamics backward from the terminal signed target.

- positive particles from $\Omega_1^r$ travel back to the source $\pi_0$
- positive particles from $\Omega_1^g$ hit the moving zero set
- negative particles from $\Omega_1^-$ also hit the zero set

The zero set acts like an annihilation boundary for ghost and negative mass.

Forward in time, it behaves like a source of paired positive and negative particles that the sampler never sees from $\pi_0$.

---

# Continuity Equation

Each branch satisfies the usual RF continuity equation:

$$
\partial_t\pi_t^\pm + \nabla\cdot(\pi_t^\pm v_t^\pm)=0.
$$

By linearity, the signed density satisfies

$$
\partial_t\pi_t^{\text{sign}}
+
\nabla\cdot
\left(
  \pi_t^{\text{sign}}v_t^{\text{signRF}}
\right)
=0.
$$

On $\Omega_t^r$, the truncated density is a valid probability density transported by the same flow.

---

# Main Sampling Guarantee

Under the regularity assumptions in the paper, source-initialized Signed RF trajectories avoid the negative region:

$$
\Pi_t^{\text{signRF}}
\left(
  \{x:\pi_t^{\text{sign}}(x)>0\}
\right)
=1,
\qquad t<1.
$$

Moreover, if $\Omega_t^r$ is the set reached by the source-initialized flow,

$$
\Pi_t^{\text{signRF}}(dx)
 =
\pi_t^{\text{sign}}(x)
\mathbf{1}_{\Omega_t^r}(x)\,dx.
$$

---
layout: intro
---

# Practical Form

The signed velocity becomes an adaptive guidance rule.

---

# Density-Ratio Guidance

Let

$$
r_t(x)=\frac{\pi_t^-(x)}{\pi_t^+(x)},
\qquad
\Delta v_t(x)=v_t^+(x)-v_t^-(x).
$$

Then

$$
v_t^{\text{signRF}}(x)
 =
v_t^+(x)
+
\lambda_t^\alpha(x)\Delta v_t(x),
$$

with

$$
\lambda_t^\alpha(x)
 =
\frac{\alpha r_t(x)}
{(1+\alpha)-\alpha r_t(x)}.
$$

---

# What Changes From Constant Guidance?

The guidance scale is state-dependent:

$$
\lambda_t^\alpha(x)
 =
\frac{\alpha r_t(x)}
{(1+\alpha)-\alpha r_t(x)}.
$$

- small $r_t(x)$: weak correction
- large $r_t(x)$: strong repulsion from $\pi^-$
- denominator near zero: the signed boundary $\pi_t^{\text{sign}}(x)=0$

This is the paper's bridge from signed measures to practical guidance.

---

# Estimating The Ratio

The method section gives two ways to obtain this ratio.

Classifier-based:

$$
r_t(x)
\approx
\frac{p_\phi(y=-\mid x)}
{p_\phi(y=+\mid x)}
$$

under balanced positive and negative noisy states.

Online tracking:

$$
u_t=\log r_t(Z_t)
$$

is integrated along the trajectory using branch velocities, scores, and a divergence term.

---

# Stabilization

The singular denominator is meaningful mathematically, but numerical samplers use finite steps.

The paper stabilizes the guidance denominator:

$$
(1+\alpha)-\alpha r_t(Z_t)
\quad\leadsto\quad
\max\{(1+\alpha)-\alpha r_t(Z_t),\epsilon\}.
$$

Optionally cap the scale:

$$
\lambda_t^\alpha \le \lambda_{\max}.
$$

---

# Core Message

Signed RF turns negative information into distributional semantics.

- start from standard RF marginal preservation
- extend convex mixtures by linearity
- extrapolate to signed mixtures
- obtain exclusion barriers and ghost regions
- recover a practical adaptive guidance rule
