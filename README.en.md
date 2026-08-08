# AI 风水户型助手 · FengShui Layout Planner

> FengShui Layout Planner is an explainable floor-plan analysis and optimization tool combining **traditional residential-layout rules** with **modern spatial-design principles**. Fixed rules, geometry constraints, and traceable scores are used throughout—never random “AI scores.”
>
> Positioning: **a traditional-living-culture and modern spatial-layout reference tool**, not fortune telling and not construction-design software.

[Live Demo](https://fengshui-layout-planner.vercel.app) · [中文文档](./README.md)

![FengShui Layout Planner home page](./docs/screenshots/home-desktop.png)

---

## Overview

| Item | Detail |
| --- | --- |
| Chinese name | AI 风水户型助手 |
| English name | FengShui Layout Planner |
| Type | Pure front-end floor-plan analysis tool |
| Runtime | Next.js + browser; data persisted locally (localStorage) |
| Core constraint | Scores are produced by a **fixed rule engine** — never by a random LLM score. |

Core capabilities:

- **18 deterministic rules** with traditional and modern explanations.
- **Five-dimension scoring**: traditional layout, circulation, privacy, function, and lighting/ventilation.
- **Visual plan editing** for rooms, openings, furniture, and screens, with drag/resize/rotate/rename/delete and undo/redo.
- **Seven explainable layers**: issue heatmap, privacy sightlines, airflow, circulation, daylight, active/quiet zoning, and the traditional energy model.
- **Furniture and door-opening optimization**, including offset openings, sealed former openings, and entry screens.
- **Non-load-bearing wall optimization** with synchronized adjacent-room polygons, areas, doors, and windows.
- **Distinct A/B/C candidates**: minimum change, balanced, and highest score.
- **Before / after scenarios** with preview-first, atomic apply, undo, and redo.
- **Local-first privacy**: no account, backend, paid API, or cloud upload; project data remains in browser localStorage.

## Product screenshots

These images are generated from the current v1.0.0 code in real Chrome through Playwright.

| Visual editor | A/B/C optimization |
| --- | --- |
| ![Visual floor-plan editor](./docs/screenshots/editor-desktop.png) | ![A/B/C optimization candidates](./docs/screenshots/abc-optimization.png) |

| Issue heatmap | Traditional energy model |
| --- | --- |
| ![Deterministic issue heatmap](./docs/screenshots/heatmap.png) | ![Traditional spatial energy model](./docs/screenshots/energy-model.png) |

> The energy layer is a **traditional-cultural visualization model, not a physical energy measurement**.

| Wall move before | Wall move after |
| --- | --- |
| ![Partition wall before movement](./docs/screenshots/wall-before.png) | ![Partition wall after movement](./docs/screenshots/wall-after.png) |

![Mobile editor](./docs/screenshots/mobile-editor.png)

## Structural Optimization

Users can classify each wall as:

- `Exterior` — immutable.
- `Load-bearing` — never moved automatically.
- `Partition` — an explicitly confirmed non-load-bearing wall eligible for safe search.
- `Unknown` — conceptual advice only; never moved automatically.

Only an explicitly marked `Partition` can be moved by the optimizer. Structural optimization can:

- move a shared non-load-bearing wall with marked rooms on both sides;
- synchronize adjacent-room `Point[]` polygons, areas, centroids, and bounds;
- keep attached doors and windows on the moved wall;
- validate minimum room area/width, self-intersection, overlap, openings, wet-zone position, and reachability;
- rerun all 18 rules, five-dimension scoring, and seven analysis layers; and
- generate preview-first A/B/C candidates with wall distances, area changes, issue differences, and relative costs.

Structural candidates are conceptual spatial proposals, not construction drawings.

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

- The structure model is inferred from user-marked room boundaries and openings; it is not CAD/BIM, structural recognition, or an automatic load-bearing assessment.
- v1.0.0 wall movement is limited to axis-aligned shared segments with marked rooms on both sides and an explicit `partition` classification. The search range is 0.15–0.8 m; both room polygons, areas, centroids, attached doors, and windows are synchronized.
- `exterior` and `load-bearing` walls are immutable; `unknown` walls allow conceptual advice only. Diagonal/curved walls, compound junctions, and one-sided wall segments are not moved automatically.
- Diagonal walls, curved walls, complex T-junctions, one-sided corridor walls, and CAD/BIM input are not supported yet.
- Candidates validate minimum room area/width, self-intersection/overlap, opening attachment, wet-zone position, reachability, and newly introduced high-severity issues. These checks are reference-grade geometry, not fire, utilities, structural engineering, accessibility, or construction approval.
- A qualified architect/structural designer and property management must confirm all real work. Candidates are not construction drawings.
- localStorage is convenient persistence, not a durable backup.

## License

[MIT](./LICENSE) © 2026 haoqiluo

## Disclaimer

- The traditional energy layer is a cultural visualization model, **not a physical energy measurement**.
- Scores and candidates depend on the completeness and accuracy of user-marked rooms, openings, scale, and boundaries.
- Structural changes are conceptual candidates. This tool does not provide construction-grade architecture, structural calculations, fire review, or utility design.
- This is not fortune telling and makes no promise about changing fate or guaranteeing health or wealth.
- Actual work must be reviewed by qualified architects, structural designers, property management, or other relevant professionals.
