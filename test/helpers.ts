import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import type { ProductTemplate, Ticket } from '../src/core'

const root = join(import.meta.dirname, '..')

export const loadFont = (name: string) => {
  const buf = readFileSync(join(root, 'resources/fonts', name))
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

export const templates: ProductTemplate[] = JSON.parse(
  readFileSync(join(root, 'resources/templates/templates.json'), 'utf8'),
)

export const ticket = (over: Partial<Ticket> = {}): Ticket => ({
  id: 't1',
  shopifyOrderId: 'gid://shopify/Order/1',
  orderNumber: '#39522',
  customerName: 'Test Customer',
  customerEmail: 'test@example.com',
  productName: 'Example Tag',
  variantTitle: '',
  sku: 'EXAMPLE-TAG',
  imageUrl: '',
  engravingText: JSON.stringify([{ key: 'engraving-text-66', value: 'HELLO' }]),
  note: '',
  orderDate: '2026-10-14T00:00:00Z',
  status: 'open',
  completedAt: null,
  ...over,
})
