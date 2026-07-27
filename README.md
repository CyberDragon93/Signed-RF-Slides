# Signed Rectified Flow — Slides

Interactive [Slidev](https://sli.dev) deck for *Signed Rectified Flow:
Negativity-Controlled Generation*. All demos integrate the exact
closed-form Signed RF dynamics (ported from the paper's figure code) —
nothing is choreographed.

## Develop

```bash
npm ci
npm run dev          # http://localhost:3030 (hash routing: /#/20)
```

## Build / Deploy

Every push to `main` builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml` (base path = repo name):

- https://rectifiedflow.github.io/Signed-RF/

Visitors can export a PDF from `/#/export/`.
