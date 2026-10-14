import type { ProductTemplate, Ticket } from '../core'
import type { Settings } from '../shared'

/** Client for engraving.cwandt.com, authenticated with a station API token. */
export class EngraveApi {
  constructor(private settings: () => Settings) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const { apiBase, apiToken } = this.settings()
    if (!apiToken) throw new Error('No API token set — add one in Settings')
    const res = await fetch(new URL(path, apiBase), {
      ...init,
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json', ...init.headers },
      redirect: 'manual', // a redirect means the proxy sent us to /signin, i.e. the token was rejected
    })
    if (res.status === 401 || res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
      throw new Error('engraving.cwandt.com rejected the API token')
    }
    if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${res.status}`)
    return res.json() as Promise<T>
  }

  listTickets(status: 'open' | 'done' = 'open') {
    return this.request<Ticket[]>(`/api/tickets?status=${status}`)
  }

  async getTicket(id: string): Promise<Ticket | null> {
    // The server has no single-ticket GET; open tickets are few, so search the list.
    const open = await this.listTickets('open')
    return open.find((t) => t.id === id) ?? (await this.listTickets('done')).find((t) => t.id === id) ?? null
  }

  async markDone(id: string) {
    // Same endpoint the web queue uses; it also fulfils the ENGRAVING line item in Shopify.
    await this.request('/api/tickets', { method: 'PATCH', body: JSON.stringify({ id, status: 'done' }) })
  }

  listTemplates() {
    return this.request<ProductTemplate[]>('/api/templates')
  }

  async saveTemplate(t: ProductTemplate) {
    await this.request('/api/templates', { method: 'PUT', body: JSON.stringify(t) })
  }
}
