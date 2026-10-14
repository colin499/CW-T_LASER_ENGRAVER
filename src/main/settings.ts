import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '../shared'

const defaults: Settings = {
  apiBase: 'https://engraving.cwandt.com',
  apiToken: '',
  useLocalTemplates: true,
  fieldSize: 110,
  driver: 'simulator',
}

const file = () => join(app.getPath('userData'), 'settings.json')

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(readFileSync(file(), 'utf8')) }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch }
  writeFileSync(file(), JSON.stringify(next, null, 2))
  return next
}
