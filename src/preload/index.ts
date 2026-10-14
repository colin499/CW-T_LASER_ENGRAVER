import { contextBridge, ipcRenderer } from 'electron'
import type { CwtApi, LaserStatus } from '../shared'

const api: CwtApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  listTickets: (status) => ipcRenderer.invoke('tickets:list', status),
  getTicket: (id) => ipcRenderer.invoke('tickets:get', id),
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  saveTemplate: (t) => ipcRenderer.invoke('templates:save', t),
  markDone: (id) => ipcRenderer.invoke('tickets:done', id),
  getFont: (name) => ipcRenderer.invoke('fonts:get', name),
  listFonts: () => ipcRenderer.invoke('fonts:list'),
  laserStatus: () => ipcRenderer.invoke('laser:status'),
  frame: (bounds) => ipcRenderer.invoke('laser:frame', bounds),
  run: (job) => ipcRenderer.invoke('laser:run', job),
  stop: () => ipcRenderer.invoke('laser:stop'),
  onLaserStatus: (cb) => {
    const h = (_e: unknown, s: LaserStatus) => cb(s)
    ipcRenderer.on('laser-status', h)
    return () => ipcRenderer.off('laser-status', h)
  },
  onOpenTicket: (cb) => {
    const h = (_e: unknown, id: string) => cb(id)
    ipcRenderer.on('open-ticket', h)
    return () => ipcRenderer.off('open-ticket', h)
  },
}

contextBridge.exposeInMainWorld('cwt', api)
