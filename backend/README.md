# Gumroad Webhook + Subscription Verification Endpoint

Minimal endpoint for One coffee-∞-GLB offline app subscription management.

## Design Principles

- **Local-first**: JSON file storage (no DB server, 0円ロジック)
- **Minimal communication**: Only when needed (monthly check)
- **Graceful degradation**: Fail silently, restrict features (your 思想)
- **NE-free**: No NE terminology, just Gumroad integration

## Setup

1. Install dependencies:
```bash
pip install -r requirements_gumroad.txt
```

2. Copy `.env.example` to `.env` and set:
```bash
GUMROAD_WEBHOOK_SECRET=your_secret_from_gumroad
DATA_DIR=./data
```

3. Run:
```bash
python gumroad_webhook.py
```

## Endpoints

### `POST /webhook/gumroad`
Receives Gumroad purchase/subscription events.

**Events handled:**
- `sale`: New purchase
- `subscription_activated`: Subscription started
- `subscription_payment_succeeded`: Monthly payment OK
- `subscription_cancelled`: Subscription ended
- `subscription_payment_failed`: Payment failed

**Response:**
```json
{
  "ok": true,
  "event": "subscription_activated",
  "key_generated": "abc123..."
}
```

### `POST /verify/subscription`
App calls this to verify subscription status (when online).

**Request:**
```json
{
  "email": "user@example.com",
  "key": "optional_key_if_provided"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "plan": "basic",
  "expires_at": "2026-04-01T00:00:00",
  "key": "generated_key_here"
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "reason": "No active subscription found"
}
```

### `GET /health`
Health check endpoint.

## Key Format

Subscription keys are generated as:
```
{email_hash}_{plan}_{expiry_YYYY-MM}_{signature}
```

Example: `a1b2c3d4_basic_2026-04_e5f6g7h8`

## Data Storage

All data stored in local JSON files:
- `data/subscriptions.json`: Active subscriptions
- `data/keys.json`: Generated keys with expiry

No database server needed (0円ロジック).

## Gumroad Setup

1. In Gumroad dashboard, set webhook URL to:
   ```
   https://your-domain.com/webhook/gumroad
   ```

2. Set webhook secret in `.env` file.

3. Product IDs should contain `one-coffee` or `glb` to be processed.

## App Integration

App should:
1. Store subscription key locally after first verification
2. Check subscription monthly (or when network available)
3. Call `/verify/subscription` with email or stored key
4. If `valid: false`, restrict to limited mode (graceful degradation)

## Notes

- Keys expire monthly (YYYY-MM format)
- App can work offline using last valid key
- When online, app checks and gets new key if subscription active
- If subscription cancelled, next check returns `valid: false` → app restricts features
