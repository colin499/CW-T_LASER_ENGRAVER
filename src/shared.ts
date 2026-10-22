import type { Bounds, Job, ProductTemplate, Ticket } from './core'

export type Settings = {
  /** engraving.cwandt.com base URL */
  apiBase: string
  /** Station API token (ENGRAVER_API_TOKENS on the server) */
  apiToken: string
  /** Use bundled resources/templates/templates.json instead of the server's templates */
  useLocalTemplates: boolean
  /** Galvo field size in mm (square) */
  fieldSize: number
  /** 'simulator' writes SVGs; 'lightburn' loads jobs into LightBurn over UDP; 'lmc' is the Phase 0 USB driver */
  driver: 'simulator' | 'lightburn' | 'lmc'
  /** LightBurn UDP interface (Device Settings → enable UDP). Reply port is lightburnPort + 1. */
  lightburnHost: string
  lightburnPort: number
  /** Negate y when writing .lbrn2 (our field space is +y down). Set after the orientation test. */
  lightburnFlipY: boolean
  /** mm offset applied to the job in LightBurn's workspace, after the flip */
  lightburnOffset: [number, number]
  /** Where .lbrn2 jobs are written; empty = the app's jobs folder */
  lightburnOutputDir: string
}

export type LaserState = 'disconnected' | 'idle' | 'framing' | 'running'

export type LaserStatus = {
  state: LaserState
  driver: Settings['driver']
  message?: string
  progress?: number
  /** Result of the last connect() probe (LightBurn PING); undefined until probed */
  connected?: boolean
}

/** The API the preload script exposes to the renderer as window.cwt */
export interface CwtApi {
  getSettings(): Promise<Settings>
  setSettings(s: Partial<Settings>): Promise<Settings>
  listTickets(status?: 'open' | 'done'): Promise<Ticket[]>
  getTicket(id: string): Promise<Ticket | null>
  listTemplates(): Promise<ProductTemplate[]>
  saveTemplate(t: ProductTemplate): Promise<void>
  markDone(id: string): Promise<void>
  getFont(name: string): Promise<ArrayBuffer>
  listFonts(): Promise<string[]>
  laserStatus(): Promise<LaserStatus>
  frame(bounds: Bounds): Promise<void>
  run(job: Job, ticketId?: string): Promise<void>
  stop(): Promise<void>
  /** Re-probe the driver (e.g. after enabling UDP in LightBurn) */
  connectLaser(): Promise<LaserStatus>
  /** Simulator and LightBurn: show the last job file in Finder/Explorer. False if there is none yet. */
  revealLastJob(): Promise<boolean>
  onLaserStatus(cb: (s: LaserStatus) => void): () => void
  /** Fired when a cwtlaser://ticket/<id> link opens the app */
  onOpenTicket(cb: (id: string) => void): () => void
  /** A ticket id from a link that arrived before the window was ready; cleared once taken. */
  takePendingTicket(): Promise<string | null>
}
