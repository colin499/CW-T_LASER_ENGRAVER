/** Ticket shape returned by engraving.cwandt.com GET /api/tickets */
export type Ticket = {
  id: string
  shopifyOrderId: string
  orderNumber: string
  customerName: string
  customerEmail: string
  productName: string
  variantTitle: string
  sku: string
  imageUrl: string
  engravingText: string
  note: string
  orderDate: string
  status: string
  completedAt: string | null
}
