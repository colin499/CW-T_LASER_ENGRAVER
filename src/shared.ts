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
  /** 'simulator' until the LMC USB driver lands (Phase 0) */
  driver: 'simulator' | 'lmc'
}

export type LaserState = 'disconnected' | 'idle' | 'framing' | 'running'

export type LaserStatus = {
  state: LaserState
  driver: Settings['driver']
  message?: string
  progress?: number
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
  /** Simulator only: show the last job SVG in Finder/Explorer. False if there is none yet. */
  revealLastJob(): Promise<boolean>
  onLaserStatus(cb: (s: LaserStatus) => void): () => void
  /** Fired when a cwtlaser://ticket/<id> link opens the app */
  onOpenTicket(cb: (id: string) => void): () => void
}
