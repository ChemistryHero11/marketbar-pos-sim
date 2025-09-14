/**
 * Market Bar POS Simulator Server
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as path from 'path';
import dotenv from 'dotenv';
import {
  CatalogItem,
  Order,
  Promotion,
  WebSocketMessage,
  WebhookPayload,
  PriceUpdateRequest,
  CreateItemRequest,
  UpdateItemRequest,
  CreateOrderRequest,
  CreatePromotionRequest,
  HealthResponse,
  CatalogResponse,
} from './types';
import {
  generateId,
  sendWebhook,
  validatePrice,
  calculateOrderTotals,
  getSeedItems,
} from './utils';

// Load environment variables
dotenv.config();

// Configuration
const PORT = parseInt(process.env.PORT || '4001', 10);
const API_KEY = process.env.API_KEY || 'pos-sim-dev-key';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'supersecret';
const MARKETBAR_WEBHOOK_URL = process.env.MARKETBAR_WEBHOOK_URL || '';

// In-memory data stores
const catalog = new Map<string, CatalogItem>();
const orders = new Map<string, Order>();
const promotions = new Map<string, Promotion>();
let menuVersion = 1;
const startTime = Date.now();

// Initialize catalog with seed data
getSeedItems().forEach(item => catalog.set(item.id, item));

// Express app setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Create HTTP server
const server = http.createServer(app);

// WebSocket setup
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection');
  wsClients.add(ws);

  ws.on('close', () => {
    console.log('🔌 WebSocket connection closed');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
    wsClients.delete(ws);
  });

  // Send initial connection message
  ws.send(JSON.stringify({
    event: 'connected',
    data: { menuVersion },
    ts: new Date().toISOString(),
  }));
});

// Broadcast to all WebSocket clients
function broadcast(message: WebSocketMessage) {
  const messageString = JSON.stringify(message);
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}

// Middleware: API Key authentication
function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const providedKey = req.headers['x-api-key'];
  
  if (!providedKey || providedKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized: Invalid API key' });
    return;
  }
  
  next();
  return;
}

// Routes

// Health check
app.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    ok: true,
    menuVersion,
    items: catalog.size,
    orders: orders.size,
    uptime: Math.floor((Date.now() - startTime) / 1000),
  };
  res.json(response);
});

// Get catalog items
app.get('/catalog/items', (_req: Request, res: Response) => {
  const response: CatalogResponse = {
    items: Array.from(catalog.values()).filter(item => item.isActive),
    menuVersion,
  };
  res.json(response);
});

// Create catalog item
app.post('/catalog/items', requireApiKey, (req: Request, res: Response) => {
  const body: CreateItemRequest = req.body;
  
  if (!body.name || !body.category || body.price == null || body.minPrice == null || body.maxPrice == null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const now = new Date();
  const item: CatalogItem = {
    id: generateId(),
    name: body.name,
    category: body.category,
    price: body.price,
    minPrice: body.minPrice,
    maxPrice: body.maxPrice,
    taxRate: body.taxRate || 0.0825,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  catalog.set(item.id, item);
  menuVersion++;

  broadcast({
    event: 'menu.published',
    data: { menuVersion, item },
    ts: now.toISOString(),
  });

  res.status(201).json(item);
  return;
});

// Update catalog item
app.patch('/catalog/items/:id', requireApiKey, (req: Request, res: Response) => {
  const { id } = req.params;
  const body: UpdateItemRequest = req.body;
  
  const item = catalog.get(id);
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  // Update fields
  if (body.name !== undefined) item.name = body.name;
  if (body.category !== undefined) item.category = body.category;
  if (body.price !== undefined) item.price = body.price;
  if (body.minPrice !== undefined) item.minPrice = body.minPrice;
  if (body.maxPrice !== undefined) item.maxPrice = body.maxPrice;
  if (body.taxRate !== undefined) item.taxRate = body.taxRate;
  if (body.isActive !== undefined) item.isActive = body.isActive;
  
  item.updatedAt = new Date();
  menuVersion++;

  broadcast({
    event: 'menu.published',
    data: { menuVersion, item },
    ts: item.updatedAt.toISOString(),
  });

  res.json(item);
  return;
});

// Delete catalog item
app.delete('/catalog/items/:id', requireApiKey, (req: Request, res: Response) => {
  const { id } = req.params;

  const item = catalog.get(id);
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  catalog.delete(id);
  menuVersion++;
  const now = new Date();

  broadcast({
    event: 'menu.published',
    data: { menuVersion, deletedItemId: id },
    ts: now.toISOString(),
  });

  res.json({ id, deleted: true, menuVersion });
  return;
});

// Update item price
app.post('/pricing/:itemId', requireApiKey, (req: Request, res: Response) => {
  const { itemId } = req.params;
  const body: PriceUpdateRequest = req.body;
  
  if (body.price == null) {
    res.status(400).json({ error: 'Price is required' });
    return;
  }

  const item = catalog.get(itemId);
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  // Validate price against guardrails
  const validation = validatePrice(item, body.price, body.overrideGuardrails);
  if (!validation.valid) {
    res.status(400).json({ error: validation.message });
    return;
  }

  // Update price
  const oldPrice = item.price;
  item.price = body.price;
  item.updatedAt = new Date();

  // Publish menu if requested
  if (body.publish) {
    menuVersion++;
  }

  broadcast({
    event: 'price.updated',
    data: {
      itemId,
      name: item.name,
      oldPrice,
      newPrice: body.price,
      menuVersion: body.publish ? menuVersion : null,
    },
    ts: item.updatedAt.toISOString(),
  });

  res.json({
    item,
    menuVersion,
    published: body.publish || false,
  });
  return;
});

// Create promotion
app.post('/promotions', requireApiKey, (req: Request, res: Response) => {
  const body: CreatePromotionRequest = req.body;
  
  if (!body.itemId || !body.kind || body.value == null) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const item = catalog.get(body.itemId);
  if (!item) {
    res.status(404).json({ error: 'Item not found' });
    return;
  }

  const now = new Date();
  const promotion: Promotion = {
    id: generateId(),
    itemId: body.itemId,
    kind: body.kind,
    value: body.value,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    isActive: true,
    createdAt: now,
  };

  promotions.set(promotion.id, promotion);

  broadcast({
    event: 'promotion.created',
    data: promotion,
    ts: now.toISOString(),
  });

  res.status(201).json(promotion);
  return;
});

// Publish menu
app.post('/menu/publish', requireApiKey, (_req: Request, res: Response) => {
  menuVersion++;
  const now = new Date();

  broadcast({
    event: 'menu.published',
    data: { menuVersion },
    ts: now.toISOString(),
  });

  res.json({ menuVersion, publishedAt: now.toISOString() });
  return;
});

// Get orders
app.get('/orders', (_req: Request, res: Response) => {
  const orderList = Array.from(orders.values()).sort((a, b) => 
    b.createdAt.getTime() - a.createdAt.getTime()
  );
  res.json({ orders: orderList });
});

// Create order
app.post('/orders', async (req: Request, res: Response) => {
  const body: CreateOrderRequest = req.body;
  
  if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ error: 'Items array is required and must not be empty' });
    return;
  }

  try {
    // Calculate order totals
    const orderCalculation = calculateOrderTotals(body.items, catalog);
    
    const now = new Date();
    const order: Order = {
      id: generateId(),
      items: orderCalculation.items.map(item => ({
        itemId: item.itemId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
      })),
      subtotal: orderCalculation.subtotal,
      tax: orderCalculation.tax,
      total: orderCalculation.total,
      status: 'completed',
      createdAt: now,
    };

    orders.set(order.id, order);

    // Broadcast to WebSocket clients
    broadcast({
      event: 'order.created',
      data: order,
      ts: now.toISOString(),
    });

    // Send webhook if configured
    if (MARKETBAR_WEBHOOK_URL) {
      const webhookPayload: WebhookPayload = {
        orderId: order.id,
        venueId: 'pos-sim-venue-001',
        timestamp: now.toISOString(),
        items: order.items.map(item => ({
          itemId: item.itemId,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        subtotal: order.subtotal,
        tax: order.tax,
        total: order.total,
      };

      // Send webhook asynchronously
      sendWebhook(MARKETBAR_WEBHOOK_URL, webhookPayload, WEBHOOK_SECRET).catch(error => {
        console.error('Failed to send webhook:', error);
      });
    }

    res.status(201).json(order);
    return;
  } catch (error: any) {
    res.status(400).json({ error: error.message });
    return;
  }
});

// Start server
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║     Market Bar POS Simulator Started! 🚀      ║
╠════════════════════════════════════════════════╣
║  Server:     http://localhost:${PORT}            ║
║  WebSocket:  ws://localhost:${PORT}/ws           ║
║  API Key:    ${API_KEY.substring(0, 8)}...             ║
║  Webhook:    ${MARKETBAR_WEBHOOK_URL ? 'Configured ✓' : 'Not configured'}              ║
║                                                ║
║  ${catalog.size} items loaded in catalog              ║
╚════════════════════════════════════════════════╝
  `);
});
