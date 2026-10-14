import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type LayerSettings,
  type ProductTemplate,
  type Scene,
  type Ticket,
  buildScene,
  compileJob,
  matchTemplate,
  parseEngravingLines,
} from '@core'
import type { LaserStatus, Settings } from '../../shared'
import { Canvas } from './Canvas'
import { demoTickets } from './demo'
import { ensureFonts, loadFont } from './fonts'
import { SettingsDialog } from './SettingsDialog'

const fmtTime = (s: number) => (s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`)
const errMsg = (e: unknown) => (e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e))

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [templates, setTemplates] = useState<ProductTemplate[]>([])
  const [fontsReady, setFontsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Ticket | null>(null)
  /** Per-job edits: engraving line values and layer settings. Reset when a ticket is opened. */
  const [lineEdits, setLineEdits] = useState<Record<number, string>>({})
  const [layerEdits, setLayerEdits] = useState<Record<string, Partial<LayerSettings>>>({})
  const [showHatch, setShowHatch] = useState(false)
  const [laser, setLaser] = useState<LaserStatus>({ state: 'idle', driver: 'simulator' })
  const [askDone, setAskDone] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const demo = settings !== null && !settings.apiToken

  const refresh = useCallback(async (s: Settings) => {
    setError(null)
    try {
      const tpl = await window.cwt.listTemplates()
      await ensureFonts(tpl)
      setTemplates(tpl)
      setFontsReady(true)
      setTickets(s.apiToken ? await window.cwt.listTickets('open') : demoTickets)
      setLoaded(true)
    } catch (e) {
      setError(errMsg(e))
    }
  }, [])

  useEffect(() => {
    window.cwt.getSettings().then((s) => {
      setSettings(s)
      refresh(s)
    })
    window.cwt.laserStatus().then(setLaser)
    const offStatus = window.cwt.onLaserStatus(setLaser)
    return offStatus
  }, [refresh])

  const openTicket = useCallback((t: Ticket) => {
    setSelected(t)
    setLineEdits({})
    setLayerEdits({})
    setAskDone(false)
  }, [])

  // cwtlaser://ticket/<id> from the web queue's "Send to laser" button. Held until the queue has loaded.
  useEffect(() => window.cwt.onOpenTicket(setPendingId), [])
  useEffect(() => {
    if (!pendingId || !loaded) return
    setPendingId(null)
    const local = tickets.find((t) => t.id === pendingId)
    if (local) return openTicket(local)
    if (demo) return setError(`Ticket ${pendingId} not found`)
    window.cwt
      .getTicket(pendingId)
      .then((t) => (t ? openTicket(t) : setError(`Ticket ${pendingId} not found`)))
      .catch((e) => setError(errMsg(e)))
  }, [pendingId, loaded, tickets, demo, openTicket])

  // Apply per-job edits on top of the ticket and template, then build the scene.
  const { scene, sceneError } = useMemo((): { scene: Scene | null; sceneError: string | null } => {
    if (!selected || !fontsReady) return { scene: null, sceneError: null }
    const lines = parseEngravingLines(selected.engravingText).map((l, i) => ({ ...l, value: lineEdits[i] ?? l.value }))
    const edited = templates.map((t) => ({
      ...t,
      layers: Object.fromEntries(Object.entries(t.layers).map(([k, l]) => [k, { ...l, ...layerEdits[k] }])),
    }))
    try {
      return { scene: buildScene({ ...selected, engravingText: JSON.stringify(lines) }, edited, loadFont), sceneError: null }
    } catch (e) {
      return { scene: null, sceneError: errMsg(e) }
    }
  }, [selected, templates, fontsReady, lineEdits, layerEdits])

  const job = useMemo(() => (scene ? compileJob(scene) : null), [scene])
  const busy = laser.state === 'framing' || laser.state === 'running'

  const run = async () => {
    if (!job) return
    setError(null)
    try {
      await window.cwt.run(job)
      const s = await window.cwt.laserStatus()
      if (s.message === 'Job complete' && selected) setAskDone(true)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const markDone = async () => {
    if (!selected) return
    try {
      if (!demo) await window.cwt.markDone(selected.id)
      setTickets((ts) => ts.filter((t) => t.id !== selected.id))
      setSelected(null)
      setAskDone(false)
    } catch (e) {
      setError(errMsg(e))
    }
  }

  const visible = tickets.filter((t) =>
    `${t.orderNumber} ${t.customerName} ${t.productName} ${t.sku} ${t.engravingText}`.toLowerCase().includes(filter.toLowerCase()),
  )
  const editLayer = (name: string, patch: Partial<LayerSettings>) =>
    setLayerEdits((e) => ({ ...e, [name]: { ...e[name], ...patch } }))

  return (
    <div className="app">
      <header className="topbar">
        <strong>CW&amp;T Laser</strong>
        <span className={`pill ${laser.state}`}>
          {laser.driver === 'simulator' ? 'Simulator' : 'Laser'} · {laser.state}
          {laser.state === 'running' && laser.progress !== undefined && ` ${Math.round(laser.progress * 100)}%`}
        </span>
        {demo && <span className="pill warn">Demo tickets — add an API token in Settings</span>}
        <span className="spacer" />
        <button onClick={() => settings && refresh(settings)}>Refresh</button>
        <button onClick={() => setSettingsOpen(true)}>Settings</button>
      </header>

      {error && (
        <div className="banner error" onClick={() => setError(null)}>
          {error}
        </div>
      )}

      <aside className="queue">
        <input className="search" placeholder="Search queue…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <div className="queue-count">{visible.length} open</div>
        {visible.map((t) => {
          const m = matchTemplate(templates, t.sku)
          return (
            <button key={t.id} className={`ticket ${selected?.id === t.id ? 'active' : ''}`} onClick={() => openTicket(t)}>
              {parseEngravingLines(t.engravingText).map((l, i) => (
                <div key={i} className="ticket-line">
                  {l.value}
                </div>
              ))}
              <div className="ticket-meta">
                <span>{t.productName}</span>
                <span className="muted">{t.sku}</span>
              </div>
              <div className="ticket-meta muted">
                <span>{t.orderNumber}</span>
                {m?.kind === 'fallback' && <span className="tag warn">no template</span>}
                {!m && <span className="tag error">no template</span>}
              </div>
            </button>
          )
        })}
      </aside>

      <main className="stage">
        {sceneError ? (
          <div className="empty">{sceneError}</div>
        ) : selected ? (
          <Canvas scene={scene} job={job} fieldSize={settings?.fieldSize ?? 110} showHatch={showHatch} />
        ) : (
          <div className="empty">Pick a ticket from the queue, or click “Send to laser” on engraving.cwandt.com.</div>
        )}
      </main>

      <aside className="inspector">
        {selected && scene ? (
          <>
            <section>
              <h3>{selected.orderNumber}</h3>
              <div>{selected.customerName}</div>
              <div className="muted">
                {selected.productName}
                {selected.variantTitle && selected.variantTitle !== 'Default Title' && ` — ${selected.variantTitle}`}
              </div>
              <div className="muted">Template: {scene.template.name}</div>
              {selected.note && <div className="note">{selected.note}</div>}
            </section>

            {scene.warnings.length > 0 && (
              <section className="warnings">
                {scene.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </section>
            )}

            <section>
              <h4>Engraving</h4>
              {parseEngravingLines(selected.engravingText).map((l, i) => (
                <label key={i} className="field-row">
                  <span className="muted small">{l.key || 'text'}</span>
                  <input
                    value={lineEdits[i] ?? l.value}
                    onChange={(e) => setLineEdits((le) => ({ ...le, [i]: e.target.value }))}
                  />
                </label>
              ))}
            </section>

            {Object.entries(scene.template.layers).map(([name, l]) => (
              <section key={name}>
                <h4>
                  <span className="swatch" style={{ background: l.color }} /> Layer “{name}” · {l.mode}
                </h4>
                <div className="grid2">
                  <Num label="Power %" value={l.power} onChange={(power) => editLayer(name, { power })} />
                  <Num label="Speed mm/s" value={l.speed} onChange={(speed) => editLayer(name, { speed })} />
                  <Num label="Freq kHz" value={l.freq} onChange={(freq) => editLayer(name, { freq })} />
                  <Num label="Q-pulse ns" value={l.qpulse ?? 0} onChange={(qpulse) => editLayer(name, { qpulse })} />
                  <Num label="Passes" value={l.passes} step={1} onChange={(passes) => editLayer(name, { passes })} />
                  {l.mode === 'fill' && (
                    <Num
                      label="Hatch mm"
                      value={l.hatch?.[0]?.spacing ?? 0.05}
                      step={0.005}
                      onChange={(spacing) => editLayer(name, { hatch: (l.hatch ?? [{ angle: 0, spacing }]).map((h) => ({ ...h, spacing })) })}
                    />
                  )}
                </div>
              </section>
            ))}

            <section>
              <label className="check">
                <input type="checkbox" checked={showHatch} onChange={(e) => setShowHatch(e.target.checked)} /> Show toolpath
              </label>
              {job && (
                <div className="muted small">
                  Estimated {fmtTime(job.stats.estSeconds)} · {(job.bounds.maxX - job.bounds.minX).toFixed(2)} ×{' '}
                  {(job.bounds.maxY - job.bounds.minY).toFixed(2)} mm
                </div>
              )}
            </section>

            <section className="actions">
              {askDone ? (
                <>
                  <div>Job complete. Mark {selected.orderNumber} as engraved?</div>
                  <button className="primary" onClick={markDone}>
                    Mark done{demo ? ' (demo)' : ' + fulfil'}
                  </button>
                  <button onClick={() => setAskDone(false)}>Not yet</button>
                </>
              ) : busy ? (
                <button className="danger" onClick={() => window.cwt.stop()}>
                  Stop {laser.state === 'framing' ? 'framing' : 'job'}
                </button>
              ) : (
                <>
                  <button disabled={!job?.layers.length} onClick={() => job && window.cwt.frame(job.bounds).catch((e) => setError(errMsg(e)))}>
                    Frame
                  </button>
                  <button className="primary" disabled={!job?.layers.length} onClick={run}>
                    Start
                  </button>
                </>
              )}
            </section>
          </>
        ) : (
          <div className="muted">No job loaded.</div>
        )}
      </aside>

      {settingsOpen && settings && (
        <SettingsDialog
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSave={async (patch) => {
            const s = await window.cwt.setSettings(patch)
            setSettings(s)
            setSettingsOpen(false)
            setSelected(null)
            refresh(s)
          }}
        />
      )}
    </div>
  )
}

function Num({ label, value, onChange, step = 'any' }: { label: string; value: number; onChange: (n: number) => void; step?: number | 'any' }) {
  return (
    <label className="field-row">
      <span className="muted small">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
      />
    </label>
  )
}
