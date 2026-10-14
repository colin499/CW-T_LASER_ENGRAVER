import type { Ticket } from '@core'

/** Shown when no API token is configured, so the workflow can be tried offline. */
export const demoTickets: Ticket[] = [
  {
    id: 'demo-1',
    shopifyOrderId: '',
    orderNumber: '#DEMO1',
    customerName: 'Demo Customer',
    customerEmail: 'demo@example.com',
    productName: 'Example Tag',
    variantTitle: '',
    sku: 'EXAMPLE-TAG',
    imageUrl: '',
    engravingText: JSON.stringify([
      { key: 'engraving-text-66', value: 'FOR MAYA' },
      { key: 'engraving-text-67', value: '2026.10.14' },
    ]),
    note: '',
    orderDate: new Date().toISOString(),
    status: 'open',
    completedAt: null,
  },
  {
    id: 'demo-2',
    shopifyOrderId: '',
    orderNumber: '#DEMO2',
    customerName: 'Demo Customer',
    customerEmail: 'demo@example.com',
    productName: 'Unmapped Product',
    variantTitle: 'Brass',
    sku: 'NO-TEMPLATE',
    imageUrl: '',
    engravingText: 'Happy birthday\nlove, J',
    note: 'Gift — please double check spelling',
    orderDate: new Date(Date.now() - 86400000).toISOString(),
    status: 'open',
    completedAt: null,
  },
]
