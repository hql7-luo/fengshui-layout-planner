# AI 风水户型助手 · FengShui Layout Planner

> A tool that combines traditional residential layout experience with modern spatial-design principles to provide **floor-plan analysis, furniture-placement suggestions, circulation optimization, and privacy / lighting-ventilation references**.
>
> This tool is **not** a fortune-telling service. It makes no promises about changing fate, guaranteeing health, or ensuring wealth. All outputs are objective observations about an existing layout and are for reference only.

Positioning: **a traditional-living-culture and modern spatial-layout reference tool**.

[中文文档](./README.md)

---

## Overview

| Item | Detail |
| --- | --- |
| Chinese name | AI 风水户型助手 |
| English name | FengShui Layout Planner |
| Type | Pure front-end floor-plan analysis tool |
| Runtime | Next.js + browser; data persisted locally (localStorage) |
| Core constraint | Scores are produced by a **fixed rule engine** — never by a random LLM score. |

Highlights:

- Upload a JPG/PNG plan, or use built-in samples (no upload required).
- Set north direction, entry-door position, and scale.
- Mark 18 element types (rooms / openings / furniture / screens) with drag, resize, rotate, rename, delete, undo/redo.
- A deterministic rule engine produces an overall score and five-dimension scores.
- Issues are annotated on the plan with traditional / modern explanations and suggestions.
- Preview and explicitly apply A/B/C candidates; candidate scores are re-computed by the same rule engine.
- Seven deterministic, independently switchable analysis layers with opacity, calculation basis, and before/after recomputation.
- Versioned local persistence with safe migration/recovery; before / after comparison; printable report.

## Quick start

Requires **Node.js ≥ 20.9** and **npm ≥ 10**.

```bash
npm ci
npm run dev      # http://localhost:3000
npm run lint
npm run typecheck
npm run test
npm run test:e2e # system Chrome, 1440×900 / 768×1024 / 390×844
npm run build
npm run start
```

## Built-in samples

| ID | Name | Demonstrates |
| --- | --- | --- |
| `entry-facing-bathroom` | Entry faces bathroom | Sightline / circulation / privacy |
| `bathroom-in-center` | Bathroom at center | Central "dirty" zone, lighting |
| `bed-facing-door` | Bed faces door, poor furniture | Bed-to-door, no back wall, mirror-to-bed |

## Scoring (five dimensions)

Each dimension starts at 100 and is reduced by rule `impacts` (with decay on repeated hits). Overall = equal-weight (0.2) average of the five.

The raw category scores stay traceable. A remaining `high` issue caps only the displayed overall score at 89; two or more structural `medium` issues (with no `high`) cap it at 92.

| Key | Dimension | Focus |
| --- | --- | --- |
| `fengshui` | Traditional layout | Door clashes, through-draft, missing corner, dirty center |
| `circulation` | Circulation | Corridors, public-area reachability, path crossing |
| `privacy` | Privacy | Entry sightlines, bedroom / master-bedroom privacy |
| `function` | Function layout | Bed/sofa/desk backing, water-fire zoning, center placement |
| `lighting` | Lighting & ventilation | Central bathroom, long-corridor lighting, corner daylight |

## Rules (18)

| # | ID | Name | Dimension | Severity |
| --- | --- | --- | --- | --- |
| 1 | `entry-door-faces-bathroom` | Entry faces bathroom | fengshui | high |
| 2 | `entry-door-faces-bedroom-door` | Entry faces bedroom door | privacy | medium |
| 3 | `door-faces-door` | Door faces door | fengshui | medium |
| 4 | `bathroom-in-center` | Bathroom at center | function | high |
| 5 | `kitchen-bathroom-too-close` | Kitchen too close to bathroom | function | medium |
| 6 | `bed-faces-door` | Bed faces bedroom door | privacy | high |
| 7 | `bed-head-no-wall` | Bed head not against wall | function | medium |
| 8 | `mirror-faces-bed` | Mirror faces bed | fengshui | medium |
| 9 | `stove-faces-sink` | Stove faces sink | function | medium |
| 10 | `stove-sink-too-close` | Stove too close to sink | function | medium |
| 11 | `living-room-far-from-entry` | Living room far from entry | circulation | medium |
| 12 | `long-corridor` | Long corridor | circulation | medium |
| 13 | `missing-corner` | Missing corner | fengshui | medium |
| 14 | `through-draft` | Doors/windows through-draft | fengshui | medium |
| 15 | `desk-no-wall-behind` | Desk back has no wall | function | low |
| 16 | `sofa-no-wall-behind` | Sofa back has no wall | function | low |
| 17 | `bathroom-faces-kitchen` | Bathroom door faces kitchen | function | high |
| 18 | `master-bedroom-privacy` | Master bedroom privacy weak | privacy | medium |

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · react-konva/Konva · Zustand · Vitest · Playwright · ESLint 9 · Vercel.

## Current boundaries

- The structure model is inferred from user-marked room rectangles and openings; it is not CAD/BIM or structural recognition.
- Automated structural candidates cover door openings moved along their attached non-load-bearing partition, sealing the former opening, and adding an entry screen/short partition. They do **not** move exterior/load-bearing walls or room boundaries and are not construction drawings.
- Without explicit load-bearing-wall data, every door/partition change is labelled a conceptual candidate. A qualified architect/structural designer and property management must confirm all real work.
- Reachability is a deterministic proximity check, not a full building-accessibility or fire-egress analysis.
- localStorage is convenient persistence, not a durable backup.

## License

[MIT](./LICENSE) © 2026 haoqiluo

## Disclaimer

This tool is for **reference and analysis only**. All scores and suggestions are computed by a fixed rule engine from user-marked input; they represent neither superstition nor metaphysics, and do not promise to change fate, health, or wealth. For actual renovation, structure changes, or load-bearing wall removal, consult qualified building/design/construction professionals.
