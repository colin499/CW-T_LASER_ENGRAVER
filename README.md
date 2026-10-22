# CW&T Laser

Desktop engraving app for our fiber galvo laser, connected to the engraving.cwandt.com queue.
Click a ticket → its text is placed in the product's jig slots with that product's laser settings → Send to LightBurn (or Start, once we drive the galvo directly) → Mark done (fulfils the Shopify engraving line item).

## Run

```sh
npm install
npm run dev        # app with hot reload
npm test           # core library tests
npm run typecheck
npm run icon       # regenerate build/icon.icns from Space Mono glyphs
```

With no API token in Settings the app shows demo tickets and uses `resources/templates/templates.json`.

```sh
npm run dist       # unsigned CW&T Laser.app in ~/Library/Caches/cwt-laser-dist/mac-*/ (registers the cwtlaser:// link)
npm run dist:dmg   # same, as a .dmg
```

## LightBurn on the laser Mac

LightBurn keeps driving the galvo (lens correction, firing); the app hands it ready-to-run jobs.

1. LightBurn → Edit → Device Settings → enable UDP commands (listens on 19840, replies on 19841). Restart LightBurn.
2. Copy `CW&T Laser.app` from `npm run dist` to the laser Mac (first launch: right-click → Open). In Settings pick driver **LightBurn on this computer**. The status pill shows `LightBurn · idle` when PING gets through, `not reachable` otherwise (also while a LightBurn dialog is open).
3. Click a ticket → **Send to LightBurn**. The app writes `<ticket>-<time>.lbrn2` to its jobs folder (or the folder set in Settings) and sends `FORCELOAD:<path>`. LightBurn opens it with one layer per template layer: Fill (`Scan`) layers carry power, speed, frequency, Q-pulse, passes, hatch interval/angle and cross-hatch; Line (`Cut`) layers trace the outlines. Frame and Start in LightBurn, then **Mark done** in the app.
4. First-time orientation check: send a job with text away from the field centre and compare with LightBurn's workspace. If it is mirrored top-to-bottom, tick **Flip Y** in Settings; if the centre is off, set the **Offset**.
5. Material presets come from our LightBurn master project: `resources/lightburn/reference.lbrn2` is a slim copy of it (cut settings only, gitignored, see the README there). A template layer names one with `"preset": "BRASS"`; the preset's galvo-only settings (ramp, wobble, flood fill…) carry over and the template's power/speed/frequency/passes/hatch are written on top. `extra: { "tag": value }` writes any further LightBurn tag.

## How it fits together

| Path | What |
| --- | --- |
| `src/core/` | Pure TS, no Electron: template matching, text layout (opentype.js), hatch fill, job compiler. Unit-tested in `test/`. |
| `src/main/` | Electron main: settings, engraving.cwandt.com API client, `cwtlaser://ticket/<id>` deep links, laser controller. |
| `src/main/galvo/` | `GalvoDriver` interface. `SimulatorDriver` writes each job as an SVG to the app's `userData/jobs/`. `LightBurnDriver` writes `.lbrn2` and loads it into LightBurn over UDP. The JCZ LMC USB driver is Phase 0. |
| `src/core/lbrn2.ts` | LightBurn project writer and the mapping from `LayerSettings` to LightBurn cut settings. |
| `src/renderer/` | React UI: queue, jig canvas, per-job text/layer edits, frame/start/mark done. |
| `resources/templates/templates.json` | Bundled product templates (fallback `*` + an example). Real templates live on the server (`/api/templates`). |
| `resources/fonts/` | Fonts templates can reference (Space Mono, our house font, plus DejaVu). Also the UI font. Extra fonts can go in `userData/fonts/`. |

Coordinates are mm in galvo field space: origin at field centre, +y down.

### Product templates
Matched by ticket SKU: exact match, then the longest `PREFIX*`, then `*`. Each `slots` key is an engravingText line key (e.g. `engraving-text-66`; `default` catches unkeyed lines). `size` is cap height in mm; text auto-shrinks to fit the slot. See `src/core/template.ts` for the full schema.

### Server side (engraving.cwandt.com, branch `laser-integration`)
- `ENGRAVER_API_TOKENS` env var: comma-separated station tokens, accepted as `Authorization: Bearer …` on `/api/tickets` and `/api/templates`.
- `product_templates` table + `GET/PUT/DELETE /api/templates`.
- "Send to laser" link on each open ticket → `cwtlaser://ticket/<id>`.

### Dev hooks
`CWT_DEBUG=1 CWT_OPEN_TICKET=<id> CWT_SCREENSHOT=out.png npx electron .` (after `npm run build`) logs renderer console output, opens a ticket, saves a window screenshot and quits. `CWT_USER_DATA=<dir>` uses a scratch settings/jobs folder.

## Roadmap
0. **LightBurn hand-off** (done, to verify on the laser Mac): orientation, units of `frequency`/`QPulseWidth`, path with spaces in FORCELOAD.
1. Real product templates + template editor UI (drag slots on the jig, save to server).
2. SVG/DXF/PDF import, layer editor, undo/redo.
3. Bitmap/dither, wobble, rotary, batch jigs, serials.
4. **LMC USB driver** (replaces LightBurn): port meerk40t's galvo driver (MIT) into `src/main/galvo/lmc.ts`, load our `.cor` lens correction, compare test squares against LightBurn.
