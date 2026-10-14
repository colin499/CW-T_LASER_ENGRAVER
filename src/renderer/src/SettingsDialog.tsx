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
            <option value="lmc" disabled>
              JCZ LMC USB — coming in Phase 0
            </option>
          </select>
        </label>
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
