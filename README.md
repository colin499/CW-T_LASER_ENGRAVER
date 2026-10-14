# CW&T Laser

Desktop engraving app for our fiber galvo laser, connected to the engraving.cwandt.com queue.
Click a ticket → its text is placed in the product's jig slots with that product's laser settings → Frame → Start → Mark done (fulfils the Shopify engraving line item).

## Run

```sh
npm install
npm run dev        # app with hot reload
npm test           # core library tests
npm run typecheck
```

With no API token in Settings the app shows demo tickets and uses `resources/templates/templates.json`.

## How it fits together

| Path | What |
| --- | --- |
| `src/core/` | Pure TS, no Electron: template matching, text layout (opentype.js), hatch fill, job compiler. Unit-tested in `test/`. |
| `src/main/` | Electron main: settings, engraving.cwandt.com API client, `cwtlaser://ticket/<id>` deep links, laser controller. |
| `src/main/galvo/` | `GalvoDriver` interface. `SimulatorDriver` writes each job as an SVG to the app's `userData/jobs/`. The JCZ LMC USB driver is Phase 0. |
| `src/renderer/` | React UI: queue, jig canvas, per-job text/layer edits, frame/start/mark done. |
| `resources/templates/templates.json` | Bundled product templates (fallback `*` + an example). Real templates live on the server (`/api/templates`). |
| `resources/fonts/` | Fonts templates can reference. Extra fonts can go in `userData/fonts/`. |

Coordinates are mm in galvo field space: origin at field centre, +y down.

### Product templates
Matched by ticket SKU: exact match, then the longest `PREFIX*`, then `*`. Each `slots` key is an engravingText line key (e.g. `engraving-text-66`; `default` catches unkeyed lines). `size` is cap height in mm; text auto-shrinks to fit the slot. See `src/core/template.ts` for the full schema.

### Server side (engraving.cwandt.com, branch `laser-integration`)
- `ENGRAVER_API_TOKENS` env var: comma-separated station tokens, accepted as `Authorization: Bearer …` on `/api/tickets` and `/api/templates`.
- `product_templates` table + `GET/PUT/DELETE /api/templates`.
- "Send to laser" link on each open ticket → `cwtlaser://ticket/<id>`.

### Dev hooks
`CWT_DEBUG=1 CWT_OPEN_TICKET=<id> CWT_SCREENSHOT=out.png npx electron .` (after `npm run build`) logs renderer console output, opens a ticket, saves a window screenshot and quits.

## Roadmap
0. **LMC USB driver**: port meerk40t's galvo driver (MIT) into `src/main/galvo/lmc.ts`, load our `.cor` lens correction, and compare test squares against LightBurn.
1. Real product templates + template editor UI (drag slots on the jig, save to server).
2. SVG/DXF/PDF import, layer editor, undo/redo.
3. Bitmap/dither, wobble, rotary, batch jigs, serials.
