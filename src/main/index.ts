import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { type Bounds, type Job, type ProductTemplate, type ReferenceCutSettings, parseReferenceCutSettings } from '../core'
import type { Settings } from '../shared'
import { EngraveApi } from './api'
import { LaserController } from './galvo/controller'
import type { GalvoDriver } from './galvo/driver'
import { LightBurnDriver } from './galvo/lightburn'
import { SimulatorDriver } from './galvo/simulator'
import { loadSettings, saveSettings } from './settings'

const PROTOCOL = 'cwtlaser'

const resourcesDir = () => (app.isPackaged ? process.resourcesPath : join(app.getAppPath(), 'resources'))
const userFontsDir = () => join(app.getPath('userData'), 'fonts')

// Dev: CWT_USER_DATA=<dir> keeps settings and jobs out of the real app data folder.
if (process.env.CWT_USER_DATA) app.setPath('userData', process.env.CWT_USER_DATA)

let settings: Settings
let win: BrowserWindow | null = null
let pendingTicketId: string | null = null

/** cwtlaser://ticket/<id> → id */
function ticketIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== `${PROTOCOL}:` || u.hostname !== 'ticket') return null
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || null
  } catch {
    return null
  }
}

function openTicket(url: string) {
  const id = ticketIdFromUrl(url)
  if (!id) return
  if (win && !win.webContents.isLoading()) {
    if (win.isMinimized()) win.restore()
    win.focus()
    win.webContents.send('open-ticket', id)
  } else {
    pendingTicketId = id
  }
}

// Single instance: a second launch (Windows/Linux deep link) forwards its URL here.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`))
    if (url) openTicket(url)
  })
  // macOS deep links
  app.on('open-url', (e, url) => {
    e.preventDefault()
    openTicket(url)
  })
}

if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [join(process.argv[1])])
} else {
  app.setAsDefaultProtocolClient(PROTOCOL)
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    title: 'CW&T Laser',
    backgroundColor: '#ffffff',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  })
  win.webContents.on('did-finish-load', () => {
    if (pendingTicketId) win?.webContents.send('open-ticket', pendingTicketId)
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env.CWT_DEBUG) devHooks(win)
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  win.on('closed', () => (win = null))
}

/**
 * Dev-only: CWT_DEBUG=1 logs renderer console output; CWT_OPEN_TICKET=<id> opens a ticket on load;
 * CWT_SCREENSHOT=<file.png> saves the window a few seconds after load and quits.
 */
function devHooks(w: BrowserWindow) {
  w.webContents.on('console-message', (e) => console.log(`[renderer:${e.level}] ${e.message}`))
  if (process.env.CWT_OPEN_TICKET) pendingTicketId = process.env.CWT_OPEN_TICKET
  const shot = process.env.CWT_SCREENSHOT
  if (shot) {
    w.webContents.once('did-finish-load', () =>
      setTimeout(async () => {
        writeFileSync(shot, (await w.capturePage()).toPNG())
        app.quit()
      }, 2500),
    )
  }
}

function localTemplates(): ProductTemplate[] {
  return JSON.parse(readFileSync(join(resourcesDir(), 'templates/templates.json'), 'utf8'))
}

function fontPath(name: string): string {
  const safe = basename(name) // never read outside the font folders
  for (const dir of [userFontsDir(), join(resourcesDir(), 'fonts')]) {
    const p = join(dir, safe)
    if (existsSync(p)) return p
  }
  throw new Error(`Font not found: ${name}`)
}

/**
 * Cut settings saved from our galvo LightBurn, used as the base for every layer we send it.
 * userData/lightburn/reference.lbrn2 overrides the bundled resources/lightburn/reference.lbrn2.
 */
function loadReference(): ReferenceCutSettings | null {
  for (const p of [join(app.getPath('userData'), 'lightburn/reference.lbrn2'), join(resourcesDir(), 'lightburn/reference.lbrn2')]) {
    if (!existsSync(p)) continue
    try {
      const ref = parseReferenceCutSettings(readFileSync(p, 'utf8'))
      console.log(`LightBurn reference: ${p} (${Object.keys(ref.byName).length} layers)`)
      return ref
    } catch (e) {
      console.error(`Could not read ${p}:`, e)
    }
  }
  return null
}

function buildDriver(): GalvoDriver {
  const jobsDir = join(app.getPath('userData'), 'jobs')
  if (settings.driver === 'lightburn') {
    const reference = loadReference()
    // Options are read per call, so edits other than the driver itself apply without a rebuild.
    return new LightBurnDriver(() => ({
      host: settings.lightburnHost || '127.0.0.1',
      port: settings.lightburnPort || 19840,
      replyPort: (settings.lightburnPort || 19840) + 1,
      outDir: settings.lightburnOutputDir || jobsDir,
      yFlip: settings.lightburnFlipY,
      offset: settings.lightburnOffset ?? [0, 0],
      reference,
      timeoutMs: 3000,
    }))
  }
  return new SimulatorDriver(jobsDir, () => settings.fieldSize)
}

app.whenReady().then(() => {
  settings = loadSettings()
  mkdirSync(userFontsDir(), { recursive: true })
  const api = new EngraveApi(() => settings)
  const laser = new LaserController(buildDriver(), (s) => win?.webContents.send('laser-status', s))
  laser.connect()
  // LightBurn can be opened or closed at any time; keep the status pill honest.
  setInterval(() => {
    if (settings.driver === 'lightburn' && !laser.busy) laser.connect()
  }, 10_000)

  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:set', async (_e, patch: Partial<Settings>) => {
    const prevDriver = settings.driver
    settings = saveSettings(patch)
    if (settings.driver !== prevDriver) await laser.setDriver(buildDriver())
    else if (settings.driver === 'lightburn') laser.connect()
    return settings
  })
  ipcMain.handle('tickets:takePending', () => {
    const id = pendingTicketId
    pendingTicketId = null
    return id
  })
  ipcMain.handle('tickets:list', (_e, status?: 'open' | 'done') => api.listTickets(status))
  ipcMain.handle('tickets:get', (_e, id: string) => api.getTicket(id))
  ipcMain.handle('tickets:done', (_e, id: string) => api.markDone(id))
  ipcMain.handle('templates:list', () => (settings.useLocalTemplates ? localTemplates() : api.listTemplates()))
  ipcMain.handle('templates:save', (_e, t: ProductTemplate) => api.saveTemplate(t))
  ipcMain.handle('fonts:list', () => {
    const names = new Set<string>()
    for (const dir of [join(resourcesDir(), 'fonts'), userFontsDir()]) {
      for (const f of readdirSync(dir)) if (/\.(ttf|otf)$/i.test(f)) names.add(f)
    }
    return [...names].sort()
  })
  ipcMain.handle('fonts:get', (_e, name: string) => {
    const buf = readFileSync(fontPath(name))
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  })
  ipcMain.handle('laser:status', () => laser.getStatus())
  ipcMain.handle('laser:frame', (_e, bounds: Bounds) => laser.frame(bounds))
  ipcMain.handle('laser:run', (_e, job: Job) => laser.run(job))
  ipcMain.handle('laser:stop', () => laser.stop())
  ipcMain.handle('laser:connect', () => laser.connect())
  ipcMain.handle('laser:revealLastJob', () => {
    const file = laser.current.lastJobFile
    if (!file) return false
    shell.showItemInFolder(file)
    return true
  })

  createWindow()
  const startUrl = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`))
  if (startUrl) openTicket(startUrl)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
