import { useState } from 'react'
import type { Settings } from '../../shared'

export function SettingsDialog({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings
  onSave: (s: Partial<Settings>) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(settings)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft((d) => ({ ...d, [k]: v }))
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Settings</h3>
        <label className="field-row">
          <span>Engrave app URL</span>
          <input value={draft.apiBase} onChange={(e) => set('apiBase', e.target.value)} />
        </label>
        <label className="field-row">
          <span>Station API token</span>
          <input type="password" value={draft.apiToken} onChange={(e) => set('apiToken', e.target.value)} placeholder="Leave empty for demo tickets" />
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.useLocalTemplates} onChange={(e) => set('useLocalTemplates', e.target.checked)} />
          Use bundled templates (instead of the server's)
        </label>
        <label className="field-row">
          <span>Galvo field size (mm)</span>
          <input type="number" value={draft.fieldSize} onChange={(e) => set('fieldSize', parseFloat(e.target.value) || 110)} />
        </label>
        <label className="field-row">
          <span>Driver</span>
          <select value={draft.driver} onChange={(e) => set('driver', e.target.value as Settings['driver'])}>
            <option value="simulator">Simulator (writes SVG, no laser)</option>
            <option value="lightburn">LightBurn on this computer (UDP)</option>
            <option value="lmc" disabled>
              JCZ LMC USB — coming in Phase 0
            </option>
          </select>
        </label>
        {draft.driver === 'lightburn' && (
          <>
            <p className="muted small">
              In LightBurn: Edit → Device Settings → enable UDP commands, then restart LightBurn. Jobs are written as .lbrn2 and
              loaded with FORCELOAD; you frame and start them in LightBurn.
            </p>
            <label className="field-row">
              <span>LightBurn host</span>
              <input value={draft.lightburnHost} onChange={(e) => set('lightburnHost', e.target.value)} placeholder="127.0.0.1" />
            </label>
            <label className="field-row">
              <span>UDP port</span>
              <input type="number" value={draft.lightburnPort} onChange={(e) => set('lightburnPort', parseInt(e.target.value) || 19840)} />
            </label>
            <label className="check">
              <input type="checkbox" checked={draft.lightburnFlipY} onChange={(e) => set('lightburnFlipY', e.target.checked)} />
              Flip Y (set if jobs appear upside down in LightBurn)
            </label>
            <label className="field-row">
              <span>Offset X / Y (mm)</span>
              <span className="pair">
                <input type="number" value={draft.lightburnOffset[0]} onChange={(e) => set('lightburnOffset', [parseFloat(e.target.value) || 0, draft.lightburnOffset[1]])} />
                <input type="number" value={draft.lightburnOffset[1]} onChange={(e) => set('lightburnOffset', [draft.lightburnOffset[0], parseFloat(e.target.value) || 0])} />
              </span>
            </label>
            <label className="field-row">
              <span>Job folder</span>
              <input value={draft.lightburnOutputDir} onChange={(e) => set('lightburnOutputDir', e.target.value)} placeholder="Empty = the app's jobs folder" />
            </label>
          </>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
