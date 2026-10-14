import { type Bounds, type Point, type Polyline, boundsOf, emptyBounds, isEmptyBounds } from './geometry'
import { hatchContours, orderPaths } from './hatch'
import type { Scene } from './scene'
import type { LayerSettings } from './template'

/** A compiled job: what the galvo driver executes, layer by layer. */
export type JobLayer = {
  name: string
  settings: LayerSettings
  /** Ordered mark paths. Closed outlines repeat their first point at the end. */
  paths: Polyline[]
}

export type Job = {
  layers: JobLayer[]
  bounds: Bounds
  stats: { markLength: number; jumpLength: number; estSeconds: number }
}

/** Galvo jumps are much faster than marks; used only for the time estimate. */
const JUMP_SPEED_MM_S = 4000

const closePath = (p: Polyline): Polyline => [...p, p[0]]

function pathLength(p: Polyline) {
  let len = 0
  for (let i = 1; i < p.length; i++) len += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return len
}

export function compileJob(scene: Scene): Job {
  const byLayer = new Map<string, Polyline[]>()
  for (const item of scene.items) {
    const list = byLayer.get(item.layer) ?? []
    list.push(...item.contours)
    byLayer.set(item.layer, list)
  }

  const layers: JobLayer[] = []
  const bounds = emptyBounds()
  let markLength = 0
  let jumpLength = 0
  let estSeconds = 0
  let cursor: Point = [0, 0]

  // Keep the template's layer order so the burn order is predictable.
  for (const [name, settings] of Object.entries(scene.template.layers)) {
    const contours = byLayer.get(name)
    if (!contours?.length) continue
    let paths: Polyline[] = []
    if (settings.mode === 'fill') {
      for (const pass of settings.hatch ?? [{ angle: 0, spacing: 0.05 }]) {
        // Hatch lines are already in scanline order; keep that, it burns more evenly than greedy reordering.
        paths.push(...hatchContours(contours, pass, settings.bidir ?? true))
      }
      if (settings.outline) paths.push(...orderPaths(contours.map(closePath), paths.at(-1)?.at(-1) ?? cursor))
    } else {
      paths = orderPaths(contours.map(closePath), cursor)
    }
    if (!paths.length) continue

    boundsOf(paths, bounds)
    let layerMark = 0
    let layerJump = 0
    for (const p of paths) {
      layerJump += Math.hypot(p[0][0] - cursor[0], p[0][1] - cursor[1])
      layerMark += pathLength(p)
      cursor = p[p.length - 1]
    }
    const passes = Math.max(1, settings.passes)
    markLength += layerMark * passes
    jumpLength += layerJump * passes
    estSeconds += passes * (layerMark / settings.speed + layerJump / JUMP_SPEED_MM_S)
    layers.push({ name, settings, paths })
  }

  return {
    layers,
    bounds: isEmptyBounds(bounds) ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : bounds,
    stats: { markLength, jumpLength, estSeconds },
  }
}
