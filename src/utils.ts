/**
 * Utility functions for Market Bar POS Simulator
 */

import crypto from 'crypto';
import { CatalogItem, WebhookPayload } from './types';

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Generate HMAC-SHA256 signature
 */
export function generateHmacSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Verify HMAC-SHA256 signature
 */
export function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = generateHmacSignature(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * Send webhook with retry logic
 */
export async function sendWebhook(
  url: string,
  payload: WebhookPayload,
  secret: string,
  maxRetries: number = 3
): Promise<void> {
  const payloadString = JSON.stringify(payload);
  const signature = generateHmacSignature(payloadString, secret);
  
  let retryCount = 0;
  let delay = 1000; // Start with 1 second

  while (retryCount <= maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pos-event': 'order.created',
          'x-pos-signature': signature,
        },
        body: payloadString,
      });

      if (response.ok) {
        console.log(`✅ Webhook sent successfully to ${url}`);
        return;
      }

      // Non-2xx response
      if (retryCount < maxRetries) {
        console.log(`⚠️ Webhook failed with status ${response.status}, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
        retryCount++;
      } else {
        throw new Error(`Webhook failed with status ${response.status}`);
      }
    } catch (error) {
      if (retryCount < maxRetries) {
        console.log(`⚠️ Webhook error: ${error}, retrying in ${delay}ms...`);
        await sleep(delay);
        delay *= 2; // Exponential backoff
        retryCount++;
      } else {
        console.error(`❌ Webhook failed after ${maxRetries + 1} attempts:`, error);
        throw error;
      }
    }
  }
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Validate price against guardrails
 */
export function validatePrice(
  item: CatalogItem,
  newPrice: number,
  overrideGuardrails: boolean = false
): { valid: boolean; message?: string } {
  if (overrideGuardrails) {
    return { valid: true };
  }

  if (newPrice < item.minPrice) {
    return {
      valid: false,
      message: `Price $${newPrice} is below minimum $${item.minPrice}`,
    };
  }

  if (newPrice > item.maxPrice) {
    return {
      valid: false,
      message: `Price $${newPrice} is above maximum $${item.maxPrice}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate order totals
 */
export function calculateOrderTotals(
  items: Array<{ itemId: string; qty: number }>,
  catalog: Map<string, CatalogItem>
): {
  items: Array<{ itemId: string; name: string; price: number; quantity: number; subtotal: number }>;
  subtotal: number;
  tax: number;
  total: number;
} {
  let subtotal = 0;
  let totalTax = 0;
  const orderItems = [];

  for (const item of items) {
    const catalogItem = catalog.get(item.itemId);
    if (!catalogItem) {
      throw new Error(`Item ${item.itemId} not found`);
    }

    const itemSubtotal = catalogItem.price * item.qty;
    const itemTax = itemSubtotal * catalogItem.taxRate;
    
    subtotal += itemSubtotal;
    totalTax += itemTax;

    orderItems.push({
      itemId: item.itemId,
      name: catalogItem.name,
      price: catalogItem.price,
      quantity: item.qty,
      subtotal: itemSubtotal,
    });
  }

  return {
    items: orderItems,
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(totalTax * 100) / 100,
    total: Math.round((subtotal + totalTax) * 100) / 100,
  };
}

/**
 * Seed initial catalog items
 */
export function getSeedItems(): CatalogItem[] {
  const now = new Date();
  return [
    {
      id: generateId(),
      name: 'IPA Pint',
      category: 'Beer',
      price: 7,
      minPrice: 5,
      maxPrice: 12,
      taxRate: 0.0825,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'Lager Pint',
      category: 'Beer',
      price: 6,
      minPrice: 4,
      maxPrice: 10,
      taxRate: 0.0825,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'House Margarita',
      category: 'Cocktails',
      price: 12,
      minPrice: 9,
      maxPrice: 18,
      taxRate: 0.0825,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'Old Fashioned',
      category: 'Cocktails',
      price: 14,
      minPrice: 11,
      maxPrice: 20,
      taxRate: 0.0825,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId(),
      name: 'Frozen Daiquiri',
      category: 'Cocktails',
      price: 10,
      minPrice: 8,
      maxPrice: 16,
      taxRate: 0.0825,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
