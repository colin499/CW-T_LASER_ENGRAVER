import { useMemo, useRef, useState } from 'react'
import type { Job, Polyline, Scene } from '@core'

type View = { cx: number; cy: number; size: number }

const pathD = (polys: Polyline[], close: boolean) =>
  polys.map((p) => 'M' + p.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join('L') + (close ? 'Z' : '')).join('')

function jigView(scene: Scene | null, fieldSize: number): View {
  const o = scene?.template.jig.outline
  if (!scene || !o) return { cx: 0, cy: 0, size: fieldSize * 1.05 }
  const [ox, oy] = scene.template.jig.origin
  return { cx: ox + o.w / 2, cy: oy + o.h / 2, size: Math.max(o.w, o.h) * 1.4 }
}

export function Canvas({
  scene,
  job,
  fieldSize,
  showHatch,
}: {
  scene: Scene | null
  job: Job | null
  fieldSize: number
  showHatch: boolean
}) {
  const fit = useMemo(() => jigView(scene, fieldSize), [scene?.template, fieldSize])
  const [view, setView] = useState<View | null>(null)
  const [lastFit, setLastFit] = useState(fit)
  if (fit !== lastFit) {
    // New template → zoom to its jig again.
    setLastFit(fit)
    setView(null)
  }
  const v = view ?? fit
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; v: View } | null>(null)

  const toMm = (clientX: number, clientY: number, from: View) => {
    const r = svgRef.current!.getBoundingClientRect()
    const scale = from.size / Math.min(r.width, r.height)
    return [from.cx + (clientX - r.left - r.width / 2) * scale, from.cy + (clientY - r.top - r.height / 2) * scale]
  }

  const onWheel = (e: React.WheelEvent) => {
    const factor = Math.exp(e.deltaY * 0.0015)
    const [mx, my] = toMm(e.clientX, e.clientY, v)
    const size = Math.min(fieldSize * 3, Math.max(1, v.size * factor))
    const k = size / v.size
    setView({ cx: mx + (v.cx - mx) * k, cy: my + (v.cy - my) * k, size })
  }

  // Square viewBox + default 'meet' scaling: the short side shows v.size mm, matching toMm().
  const half = fieldSize / 2
  const minor = v.size < 30 ? 1 : 10
  const gridLines = []
  for (let g = -half; g <= half + 1e-9; g += minor) {
    const major = Math.abs(g % 10) < 1e-9
    gridLines.push(
      <line key={`x${g}`} x1={g} y1={-half} x2={g} y2={half} className={major ? 'grid major' : 'grid'} />,
      <line key={`y${g}`} x1={-half} y1={g} x2={half} y2={g} className={major ? 'grid major' : 'grid'} />,
    )
  }

  const jig = scene?.template.jig
  const layers = scene?.template.layers ?? {}

  return (
    <div className="canvas">
      <svg
        ref={svgRef}
        viewBox={`${v.cx - v.size / 2} ${v.cy - v.size / 2} ${v.size} ${v.size}`}
        onWheel={onWheel}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, v }
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          const d = drag.current
          const [x0, y0] = toMm(d.x, d.y, d.v)
          const [x1, y1] = toMm(e.clientX, e.clientY, d.v)
          setView({ ...d.v, cx: d.v.cx - (x1 - x0), cy: d.v.cy - (y1 - y0) })
        }}
        onPointerUp={() => (drag.current = null)}
        onDoubleClick={() => setView(null)}
      >
        <rect x={-half} y={-half} width={fieldSize} height={fieldSize} className="field" />
        {gridLines}
        <line x1={-2} y1={0} x2={2} y2={0} className="origin" />
        <line x1={0} y1={-2} x2={0} y2={2} className="origin" />

        {jig && (
          <g transform={`translate(${jig.origin[0]} ${jig.origin[1]}) rotate(${jig.rotation})`}>
            {jig.outline && (
              <rect width={jig.outline.w} height={jig.outline.h} rx={jig.outline.radius ?? 0} className="part" />
            )}
            {Object.entries(scene!.template.slots).map(([key, s]) => (
              <g key={key}>
                <rect x={s.x} y={s.y} width={s.w} height={s.h} className="slot" />
              </g>
            ))}
          </g>
        )}

        {scene?.items.map((item) => (
          <path
            key={item.id}
            d={pathD(item.contours, true)}
            fillRule="evenodd"
            className="art"
            style={{ fill: showHatch ? 'none' : layers[item.layer]?.color ?? 'currentColor' }}
          />
        ))}

        {showHatch &&
          job?.layers.map((l) => (
            <path key={l.name} d={pathD(l.paths, false)} className="hatch" style={{ stroke: l.settings.color }} />
          ))}

        {job && job.layers.length > 0 && (
          <rect
            x={job.bounds.minX}
            y={job.bounds.minY}
            width={job.bounds.maxX - job.bounds.minX}
            height={job.bounds.maxY - job.bounds.minY}
            className="frame"
          />
        )}
      </svg>
      <div className="canvas-hint">scroll to zoom · drag to pan · double-click to fit jig</div>
    </div>
  )
}
