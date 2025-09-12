/**
 * Type definitions for Market Bar POS Simulator
 */

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  taxRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Order {
  id: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: 'pending' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface Promotion {
  id: string;
  itemId: string;
  kind: 'percent_off' | 'amount_off';
  value: number;
  startsAt?: Date;
  endsAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

export interface WebSocketMessage {
  event: 'order.created' | 'price.updated' | 'menu.published' | 'promotion.created';
  data: any;
  ts: string;
}

export interface WebhookPayload {
  orderId: string;
  venueId: string;
  timestamp: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  subtotal: number;
  tax: number;
  total: number;
}

export interface PriceUpdateRequest {
  price: number;
  publish?: boolean;
  overrideGuardrails?: boolean;
}

export interface CreateItemRequest {
  name: string;
  category: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  taxRate?: number;
}

export interface UpdateItemRequest {
  name?: string;
  category?: string;
  price?: number;
  minPrice?: number;
  maxPrice?: number;
  taxRate?: number;
  isActive?: boolean;
}

export interface CreateOrderRequest {
  items: Array<{
    itemId: string;
    qty: number;
  }>;
}

export interface CreatePromotionRequest {
  itemId: string;
  kind: 'percent_off' | 'amount_off';
  value: number;
  startsAt?: string;
  endsAt?: string;
}

export interface HealthResponse {
  ok: boolean;
  menuVersion: number;
  items: number;
  orders: number;
  uptime: number;
}

export interface CatalogResponse {
  items: CatalogItem[];
  menuVersion: number;
}
