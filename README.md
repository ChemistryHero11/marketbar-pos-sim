# Market Bar POS Simulator

A production-quality POS (Point of Sale) simulator for testing Market Bar Inc.'s dynamic drink-pricing platform. This simulator provides a complete mock POS system with order generation, price updates, webhook notifications, and real-time WebSocket events.

## Features

- 🍺 **Dynamic Catalog Management** - Create, update, and manage menu items with price guardrails
- 💰 **Real-time Price Updates** - Update prices with min/max validation and menu publishing
- 📦 **Order Processing** - Create orders with automatic tax calculation
- 🔔 **Webhook Integration** - Send HMAC-signed webhooks to Market Bar backend
- 🔌 **WebSocket Events** - Real-time event streaming for orders, prices, and menu updates
- 🎨 **Modern Web UI** - Beautiful interface for manual testing and simulation
- 🔐 **API Security** - API key authentication for write operations

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and update as needed:

```bash
cp .env.example .env
```

Default configuration:
```env
PORT=4001
API_KEY=pos-sim-dev-key
WEBHOOK_SECRET=supersecret
MARKETBAR_WEBHOOK_URL=http://localhost:4000/webhooks/pos
```

### 3. Run the Simulator

```bash
npm run dev
```

The simulator will start on http://localhost:4001

## API Reference

### Health Check

```bash
curl http://localhost:4001/health
```

### Get Catalog Items

```bash
curl http://localhost:4001/catalog/items
```

### Create Order

```bash
curl -X POST http://localhost:4001/orders \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"itemId": "ITEM_ID_HERE", "qty": 2},
      {"itemId": "ANOTHER_ITEM_ID", "qty": 1}
    ]
  }'
```

### Delete Item

```bash
curl -X DELETE http://localhost:4001/catalog/items/ITEM_ID_HERE \
  -H "x-api-key: pos-sim-dev-key"
```

### Update Item Price

```bash
curl -X POST http://localhost:4001/pricing/ITEM_ID_HERE \
  -H "Content-Type: application/json" \
  -H "x-api-key: pos-sim-dev-key" \
  -d '{
    "price": 8.50,
    "publish": true,
    "overrideGuardrails": false
  }'
```

### Create New Item

```bash
curl -X POST http://localhost:4001/catalog/items \
  -H "Content-Type: application/json" \
  -H "x-api-key: pos-sim-dev-key" \
  -d '{
    "name": "Craft Beer",
    "category": "Beer",
    "price": 9,
    "minPrice": 7,
    "maxPrice": 15,
    "taxRate": 0.0825
  }'
```

### Update Existing Item

```bash
curl -X PATCH http://localhost:4001/catalog/items/ITEM_ID_HERE \
  -H "Content-Type: application/json" \
  -H "x-api-key: pos-sim-dev-key" \
  -d '{
    "name": "Premium IPA",
    "price": 10
  }'
```

### Create Promotion

```bash
curl -X POST http://localhost:4001/promotions \
  -H "Content-Type: application/json" \
  -H "x-api-key: pos-sim-dev-key" \
  -d '{
    "itemId": "ITEM_ID_HERE",
    "kind": "percent_off",
    "value": 20,
    "startsAt": "2024-01-01T00:00:00Z",
    "endsAt": "2024-12-31T23:59:59Z"
  }'
```

### Publish Menu

```bash
curl -X POST http://localhost:4001/menu/publish \
  -H "x-api-key: pos-sim-dev-key"
```

## Webhook Integration

### Webhook Format

When an order is created, the simulator sends a webhook to `MARKETBAR_WEBHOOK_URL` with:

**Headers:**
- `Content-Type: application/json`
- `x-pos-event: order.created`
- `x-pos-signature: HMAC-SHA256_SIGNATURE`

**Payload:**
```json
{
  "orderId": "abc123",
  "venueId": "pos-sim-venue-001",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "items": [
    {
      "itemId": "item123",
      "name": "IPA Pint",
      "quantity": 2,
      "price": 7.00
    }
  ],
  "subtotal": 14.00,
  "tax": 1.16,
  "total": 15.16
}
```

### Signature Verification

To verify the webhook signature in your Market Bar backend:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler
app.post('/webhooks/pos', (req, res) => {
  const signature = req.headers['x-pos-signature'];
  const isValid = verifyWebhook(req.body, signature, process.env.WEBHOOK_SECRET);
  
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  
  // Process webhook...
});
```

## WebSocket Events

Connect to `ws://localhost:4001/ws` to receive real-time events:

### Event Types

- `order.created` - New order created
- `price.updated` - Item price changed
- `menu.published` - Menu version incremented
- `promotion.created` - New promotion added

### Event Format

```json
{
  "event": "order.created",
  "data": {
    "id": "order123",
    "items": [...],
    "total": 25.50
  },
  "ts": "2024-01-01T12:00:00.000Z"
}
```

### JavaScript WebSocket Client Example

```javascript
const ws = new WebSocket('ws://localhost:4001/ws');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(`Event: ${message.event}`, message.data);
};
```

## Security & Rate Limits

### API Key Authentication

Write endpoints require the `x-api-key` header:
- `/catalog/items` (POST, PATCH)
- `/pricing/:itemId` (POST)
- `/promotions` (POST)
- `/menu/publish` (POST)

### Price Guardrails

Items have `minPrice` and `maxPrice` constraints. Price updates outside these bounds will be rejected unless `overrideGuardrails: true` is set.

### Retry Strategy

Webhook delivery uses exponential backoff:
- Attempt 1: Immediate
- Attempt 2: After 1 second
- Attempt 3: After 2 seconds
- Attempt 4: After 4 seconds
- Give up and log error

## Development

### Project Structure

```
marketbar-pos-sim/
├── src/
│   ├── server.ts      # Main server with Express & WebSocket
│   ├── types.ts       # TypeScript type definitions
│   └── utils.ts       # Utility functions (HMAC, webhooks, etc.)
├── public/
│   └── index.html     # Web UI for manual testing
├── package.json       # Dependencies and scripts
├── tsconfig.json      # TypeScript configuration
├── .env.example       # Environment template
└── README.md          # This file
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Run production build
- `npm run clean` - Remove build artifacts

### Seed Data

The simulator starts with 5 pre-configured items:
- **IPA Pint** - $7 (min: $5, max: $12)
- **Lager Pint** - $6 (min: $4, max: $10)
- **House Margarita** - $12 (min: $9, max: $18)
- **Old Fashioned** - $14 (min: $11, max: $20)
- **Frozen Daiquiri** - $10 (min: $8, max: $16)

All items have 8.25% tax rate.

## Testing Market Bar Integration

### 1. Point Market Bar to Simulator

Update your Market Bar backend configuration:
```env
POS_WEBHOOK_ENDPOINT=http://localhost:4001
POS_API_KEY=pos-sim-dev-key
```

### 2. Test Order Flow

```bash
# Create an order in the simulator
curl -X POST http://localhost:4001/orders \
  -H "Content-Type: application/json" \
  -d '{"items": [{"itemId": "ITEM_ID", "qty": 2}]}'

# Your Market Bar backend should receive the webhook
# and process the order event
```

### 3. Test Price Update Flow

```bash
# Market Bar sends price update to simulator
curl -X POST http://localhost:4001/pricing/ITEM_ID \
  -H "x-api-key: pos-sim-dev-key" \
  -H "Content-Type: application/json" \
  -d '{"price": 8.50, "publish": true}'

# Check that price was updated
curl http://localhost:4001/catalog/items
```

### 4. Use the Web UI

1. Open http://localhost:4001 in your browser
2. Use the interface to:
   - View catalog with live prices
   - Update prices manually
   - Create orders by adding items to cart
   - Simulate multiple random orders
   - Monitor WebSocket events in real-time

## Troubleshooting

### Webhook Not Received

1. Check `MARKETBAR_WEBHOOK_URL` is set correctly
2. Verify Market Bar backend is running
3. Check console logs for webhook errors
4. Test webhook endpoint directly:
   ```bash
   curl -X POST http://localhost:4000/webhooks/pos \
     -H "Content-Type: application/json" \
     -H "x-pos-signature: test" \
     -d '{"test": true}'
   ```

### WebSocket Connection Issues

1. Ensure no firewall blocking WebSocket connections
2. Check browser console for errors
3. Verify server is running on correct port
4. Try connecting with a WebSocket client:
   ```bash
   npm install -g wscat
   wscat -c ws://localhost:4001/ws
   ```

### Price Update Rejected

1. Check price is within min/max bounds
2. Verify API key is correct
3. Use `overrideGuardrails: true` to bypass limits
4. Check server logs for validation errors

## Support

For issues or questions about the POS Simulator, please contact the Market Bar engineering team.

## License

© 2024 Market Bar Inc. All rights reserved.
