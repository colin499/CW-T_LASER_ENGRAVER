/**
 * LightBurn project (.lbrn2) writer.
 *
 * Format verified against a project saved by LightBurn 1.7.03 for our JCZFiber (LMC4) device:
 * - XML. Root <LightBurnProject AppVersion DeviceName FormatVersion MaterialHeight MirrorX MirrorY>.
 * - One <CutSetting type="Cut|Scan|Tool"> per layer; every setting is a child <tag Value="…"/>.
 *   'Cut' is a line layer, 'Scan' a fill layer. Shapes reference the layer by <index>.
 *   Tags seen: index name minPower maxPower maxPower2 speed frequency (Hz) QPulseWidth (ns) numPasses
 *   priority interval (mm) angle crossHatch bidir anglePerPass autoRotate floodFill scanOpt rampLength
 *   rampOuter wobbleStep wobbleSize hide tabCount tabCountMax. Booleans are 1/0. `hide=1` is a layer
 *   whose output is off, so it is never copied from the reference.
 * - <Shape Type="Path" CutIndex="n"><XForm>a b c d e f</XForm><VertList>…</VertList><PrimList>…</PrimList></Shape>
 *   VertList is "V<x> <y>c0x1c1x1" per vertex, concatenated (c0x1/c1x1 = no bezier handles).
 *   PrimList is "L<i> <j>" per line segment. A loop is closed by a segment back to its first vertex.
 * - Units are mm.
 *
 * Still to confirm on the laser: whether LightBurn's galvo workspace is +y up (see Lbrn2Options.yFlip).
 */
import type { Polyline } from './geometry'
import type { Job } from './job'
import type { LayerSettings } from './template'

export type CutSettingValues = Record<string, string | number | boolean>

/** Reference tags that must not leak into the layers we send (hide = output off). */
const NOT_COPIED = new Set(['hide', 'index', 'name', 'priority'])

/** Cut settings lifted from a project saved by LightBurn, used as defaults for ours. */
export type ReferenceCutSettings = {
  /** CutSetting blocks keyed by their <name Value> (our material presets: BRASS, SS, AL DARK, …) */
  byName: Record<string, CutSettingValues>
  /** Attributes of the <LightBurnProject> root */
  root: Record<string, string>
  /** How the reference writes booleans */
  boolStyle: 'number' | 'word'
}

export type Lbrn2Options = {
  /** Negate y. Our field space is +y down; set when LightBurn's workspace turns out to be +y up. */
  yFlip?: boolean
  /** mm added after the flip: where our field centre (0,0) sits in LightBurn's workspace */
  offset?: [number, number]
  reference?: ReferenceCutSettings | null
  /** Decimal places for coordinates (default 4) */
  precision?: number
}

const DEFAULT_ROOT: Record<string, string> = {
  AppVersion: '1.7.00',
  FormatVersion: '1',
  MaterialHeight: '0',
  MirrorX: 'False',
  MirrorY: 'False',
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const fmt = (n: number, precision: number) => {
  const s = n.toFixed(precision)
  return s.includes('.') ? s.replace(/\.?0+$/, '').replace(/^-0$/, '0') : s
}

/** Minimal parser for the parts of a LightBurn project we reuse. No XML library needed. */
export function parseReferenceCutSettings(xml: string): ReferenceCutSettings {
  const root: Record<string, string> = {}
  const rootMatch = xml.match(/<LightBurnProject\b([^>]*)>/)
  if (rootMatch) {
    for (const m of rootMatch[1].matchAll(/([\w:-]+)="([^"]*)"/g)) root[m[1]] = m[2]
  }
  const byName: Record<string, CutSettingValues> = {}
  let boolStyle: ReferenceCutSettings['boolStyle'] = 'number'
  for (const block of xml.matchAll(/<CutSetting\b([^>]*)>([\s\S]*?)<\/CutSetting>/g)) {
    const values: CutSettingValues = {}
    for (const m of block[2].matchAll(/<([\w:-]+)\s+Value="([^"]*)"\s*\/>/g)) {
      const [, tag, raw] = m
      if (raw === 'True' || raw === 'False') boolStyle = 'word'
      values[tag] = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw
    }
    if (typeof values.name === 'string') byName[values.name] = values
  }
  return { byName, root, boolStyle }
}

/** The LightBurn layer type for a layer: Scan = fill, Cut = line. */
export function cutSettingType(s: LayerSettings): string {
  if (s.mode !== 'fill') return 'Cut'
  return s.outline ? 'Scan+Cut' : 'Scan'
}

/**
 * Map our layer settings onto a LightBurn cut setting. Later wins:
 * reference block named settings.preset (or this layer's name) → mapped values → settings.extra → index/name.
 */
export function layerToCutSetting(
  index: number,
  name: string,
  s: LayerSettings,
  ref?: ReferenceCutSettings | null,
): { type: string; values: CutSettingValues } {
  const type = cutSettingType(s)
  const mapped: CutSettingValues = {
    priority: index,
    minPower: s.power,
    maxPower: s.power,
    speed: s.speed,
    numPasses: Math.max(1, s.passes),
    frequency: s.freq * 1000, // our kHz → Hz; confirm against the reference file
  }
  if (s.qpulse !== undefined) mapped.QPulseWidth = s.qpulse
  if (s.mode === 'fill') {
    const hatch = s.hatch ?? [{ angle: 0, spacing: 0.05 }]
    mapped.interval = hatch[0].spacing
    mapped.angle = hatch[0].angle
    mapped.crossHatch = hatch.length >= 2
    if (s.bidir !== undefined) mapped.bidir = s.bidir
  }
  const preset = ref ? (s.preset ? ref.byName[s.preset] : undefined) ?? ref.byName[name] ?? (s.name ? ref.byName[s.name] : undefined) : undefined
  const base = { ...preset }
  for (const k of NOT_COPIED) delete base[k]
  const values: CutSettingValues = { ...base, ...mapped, ...s.extra, index, name }
  return { type, values }
}

function cutSettingXml(type: string, values: CutSettingValues, boolStyle: ReferenceCutSettings['boolStyle']) {
  const lines = Object.entries(values).map(([tag, v]) => {
    const text =
      typeof v === 'boolean' ? (boolStyle === 'word' ? (v ? 'True' : 'False') : v ? '1' : '0') : String(v)
    return `    <${tag} Value="${xmlEscape(text)}"/>`
  })
  return `  <CutSetting type="${xmlEscape(type)}">\n${lines.join('\n')}\n  </CutSetting>`
}

/** One <Shape Type="Path"> holding every contour as its own closed loop, so glyph counters stay holes. */
export function contoursToShape(
  contours: Polyline[],
  cutIndex: number,
  opts: { yFlip: boolean; offset: [number, number]; precision: number },
): string | null {
  let verts = ''
  let prims = ''
  let base = 0
  for (let c of contours) {
    // Drop repeated consecutive points (flattened curves produce them) and a closing duplicate of the first point.
    c = c.filter((p, i) => i === 0 || p[0] !== c[i - 1][0] || p[1] !== c[i - 1][1])
    if (c.length > 1 && c[0][0] === c[c.length - 1][0] && c[0][1] === c[c.length - 1][1]) c = c.slice(0, -1)
    if (c.length < 2) continue
    for (const [x, y] of c) {
      const px = x + opts.offset[0]
      const py = (opts.yFlip ? -y : y) + opts.offset[1]
      verts += `V${fmt(px, opts.precision)} ${fmt(py, opts.precision)}c0x1c1x1`
    }
    for (let i = 0; i < c.length; i++) prims += `L${base + i} ${base + ((i + 1) % c.length)}`
    base += c.length
  }
  if (!base) return null
  return (
    `  <Shape Type="Path" CutIndex="${cutIndex}">\n` +
    `    <XForm>1 0 0 1 0 0</XForm>\n` +
    `    <VertList>${verts}</VertList>\n` +
    `    <PrimList>${prims}</PrimList>\n` +
    `  </Shape>`
  )
}

export function jobToLbrn2(job: Job, opts: Lbrn2Options = {}): string {
  const ref = opts.reference ?? null
  const shapeOpts = { yFlip: opts.yFlip ?? false, offset: opts.offset ?? [0, 0], precision: opts.precision ?? 4 }
  const root = { ...DEFAULT_ROOT, ...ref?.root }
  const rootAttrs = Object.entries(root)
    .map(([k, v]) => `${k}="${xmlEscape(v)}"`)
    .join(' ')

  const cuts: string[] = []
  const shapes: string[] = []
  job.layers.forEach((layer, i) => {
    const { type, values } = layerToCutSetting(i, layer.name, layer.settings, ref)
    cuts.push(cutSettingXml(type, values, ref?.boolStyle ?? 'number'))
    const shape = contoursToShape(layer.contours, i, shapeOpts)
    if (shape) shapes.push(shape)
  })

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<LightBurnProject ${rootAttrs}>\n` +
    (cuts.length ? cuts.join('\n') + '\n' : '') +
    (shapes.length ? shapes.join('\n') + '\n' : '') +
    `</LightBurnProject>\n`
  )
}
