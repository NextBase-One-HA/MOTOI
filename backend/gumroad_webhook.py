#!/usr/bin/env python3
"""
Gumroad Webhook + Subscription Verification Endpoint
Minimal design for One coffee-∞-GLB offline app.

Design principles (from 0円ロジック):
- Local-first: JSON file storage (no DB server)
- Minimal communication: Only when needed
- Graceful degradation: Fail silently, restrict features
"""

import json
import hmac
import hashlib
import time
from datetime import datetime, timedelta
from pathlib import Path
from flask import Flask, request, jsonify
import os

app = Flask(__name__)

# Config (set via environment or .env)
GUMROAD_WEBHOOK_SECRET = os.getenv('GUMROAD_WEBHOOK_SECRET', '')
DATA_DIR = Path(os.getenv('DATA_DIR', './data'))
SUBSCRIPTIONS_FILE = DATA_DIR / 'subscriptions.json'
KEYS_FILE = DATA_DIR / 'keys.json'

# Ensure data directory exists
DATA_DIR.mkdir(exist_ok=True)


# ============================================
# Subscription Storage (Local JSON)
# ============================================

def load_subscriptions():
    """Load subscription data from local JSON."""
    if not SUBSCRIPTIONS_FILE.exists():
        return {}
    try:
        with open(SUBSCRIPTIONS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}


def save_subscriptions(data):
    """Save subscription data to local JSON."""
    with open(SUBSCRIPTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def load_keys():
    """Load key data from local JSON."""
    if not KEYS_FILE.exists():
        return {}
    try:
        with open(KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}


def save_keys(data):
    """Save key data to local JSON."""
    with open(KEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ============================================
# Key Generation (Expiry-based)
# ============================================

def generate_subscription_key(email, plan_type='basic', months_valid=1):
    """
    Generate a subscription key with embedded expiry.
    
    Format: {email_hash}_{plan}_{expiry_ym}_{signature}
    """
    # Hash email for privacy
    email_hash = hashlib.sha256(email.encode()).hexdigest()[:12]
    
    # Calculate expiry (YYYY-MM format)
    expiry_date = datetime.now() + timedelta(days=30 * months_valid)
    expiry_ym = expiry_date.strftime('%Y-%m')
    
    # Create payload
    payload = f"{email_hash}_{plan_type}_{expiry_ym}"
    
    # Sign with secret (if available)
    if GUMROAD_WEBHOOK_SECRET:
        signature = hmac.new(
            GUMROAD_WEBHOOK_SECRET.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()[:16]
        key = f"{payload}_{signature}"
    else:
        key = payload
    
    return key


# ============================================
# Gumroad Webhook Handler
# ============================================

def verify_gumroad_webhook(data, signature):
    """Verify Gumroad webhook signature."""
    if not GUMROAD_WEBHOOK_SECRET:
        # In dev, skip verification if secret not set
        return True
    
    expected = hmac.new(
        GUMROAD_WEBHOOK_SECRET.encode(),
        json.dumps(data, sort_keys=True).encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(expected, signature)


@app.route('/webhook/gumroad', methods=['POST'])
def gumroad_webhook():
    """
    Handle Gumroad purchase/subscription events.
    
    Events:
    - sale: New purchase
    - subscription_activated: Subscription started
    - subscription_cancelled: Subscription ended
    - subscription_payment_succeeded: Monthly payment OK
    - subscription_payment_failed: Payment failed
    """
    try:
        data = request.get_json()
        signature = request.headers.get('X-Gumroad-Signature', '')
        
        # Verify webhook (optional in dev)
        if GUMROAD_WEBHOOK_SECRET and not verify_gumroad_webhook(data, signature):
            return jsonify({'error': 'Invalid signature'}), 401
        
        event = data.get('event')
        email = data.get('email', '')
        product_id = data.get('product_id', '')
        
        # Only process One coffee-∞-GLB product
        if 'one-coffee' not in product_id.lower() and 'glb' not in product_id.lower():
            return jsonify({'ok': True, 'ignored': 'Not GLB product'}), 200
        
        subscriptions = load_subscriptions()
        keys_db = load_keys()
        
        # Handle different events
        if event in ['sale', 'subscription_activated', 'subscription_payment_succeeded']:
            # Active subscription
            plan_type = 'supporter' if 'supporter' in product_id.lower() else 'basic'
            
            # Generate key for this month
            key = generate_subscription_key(email, plan_type, months_valid=1)
            
            # Store subscription
            subscriptions[email] = {
                'email': email,
                'plan': plan_type,
                'status': 'active',
                'last_payment': datetime.now().isoformat(),
                'product_id': product_id,
            }
            
            # Store key
            keys_db[key] = {
                'email': email,
                'plan': plan_type,
                'expires_at': (datetime.now() + timedelta(days=30)).isoformat(),
                'created_at': datetime.now().isoformat(),
            }
            
            save_subscriptions(subscriptions)
            save_keys(keys_db)
            
            # TODO: Send key to user via email (Gumroad handles this, or use your email service)
            # For now, key is stored and can be retrieved via /verify/subscription
            
            return jsonify({
                'ok': True,
                'event': event,
                'key_generated': key[:20] + '...',  # Don't expose full key
            }), 200
        
        elif event in ['subscription_cancelled', 'subscription_payment_failed']:
            # Subscription ended/failed
            if email in subscriptions:
                subscriptions[email]['status'] = 'inactive'
                subscriptions[email]['cancelled_at'] = datetime.now().isoformat()
                save_subscriptions(subscriptions)
            
            return jsonify({'ok': True, 'event': event, 'status': 'inactive'}), 200
        
        return jsonify({'ok': True, 'event': event, 'note': 'Unhandled event'}), 200
    
    except Exception as e:
        # Graceful degradation: Log but don't crash
        print(f"Webhook error: {e}")
        return jsonify({'error': 'Internal error'}), 500


# ============================================
# Subscription Verification (App calls this)
# ============================================

@app.route('/verify/subscription', methods=['POST'])
def verify_subscription():
    """
    Verify subscription status (called by app when online).
    
    Request:
    {
        "email": "user@example.com",
        "key": "optional_key_if_provided"
    }
    
    Response:
    {
        "valid": true/false,
        "plan": "basic" | "supporter",
        "expires_at": "2026-04-01T00:00:00",
        "key": "new_key_if_needed"
    }
    """
    try:
        data = request.get_json()
        email = data.get('email', '')
        provided_key = data.get('key', '')
        
        subscriptions = load_subscriptions()
        keys_db = load_keys()
        
        # Check by email first
        if email and email in subscriptions:
            sub = subscriptions[email]
            if sub.get('status') == 'active':
                # Generate/return current key
                plan = sub.get('plan', 'basic')
                key = generate_subscription_key(email, plan, months_valid=1)
                
                # Check if key exists, if not create it
                if key not in keys_db:
                    keys_db[key] = {
                        'email': email,
                        'plan': plan,
                        'expires_at': (datetime.now() + timedelta(days=30)).isoformat(),
                        'created_at': datetime.now().isoformat(),
                    }
                    save_keys(keys_db)
                
                return jsonify({
                    'valid': True,
                    'plan': plan,
                    'expires_at': keys_db[key]['expires_at'],
                    'key': key,  # Return key for app to store locally
                }), 200
        
        # Check by key if provided
        if provided_key and provided_key in keys_db:
            key_data = keys_db[provided_key]
            expires_at = datetime.fromisoformat(key_data['expires_at'])
            
            if datetime.now() < expires_at:
                return jsonify({
                    'valid': True,
                    'plan': key_data['plan'],
                    'expires_at': key_data['expires_at'],
                    'key': provided_key,
                }), 200
        
        # Not valid
        return jsonify({
            'valid': False,
            'reason': 'No active subscription found',
        }), 200  # 200 OK but valid=false (graceful degradation)
    
    except Exception as e:
        print(f"Verification error: {e}")
        return jsonify({
            'valid': False,
            'error': 'Internal error',
        }), 500


# ============================================
# Health Check
# ============================================

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'One coffee-∞-GLB Subscription Service',
        'timestamp': datetime.now().isoformat(),
    }), 200


# ============================================
# Main
# ============================================

if __name__ == '__main__':
    print("Starting Gumroad Webhook + Subscription Service...")
    print(f"Data directory: {DATA_DIR}")
    print(f"Subscriptions file: {SUBSCRIPTIONS_FILE}")
    print(f"Keys file: {KEYS_FILE}")
    
    # Run on port 5000 (adjust as needed)
    app.run(host='0.0.0.0', port=5000, debug=True)
