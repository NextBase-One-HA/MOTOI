One coffee-∞-GLB — SHIP NOW (Web + Gumroad)

GOAL
- Sell with Gumroad subscription.
- App: offline-first web app (PWA). (We will plug in the offline dictionary + rules next.)
- Backend: Gumroad webhook + subscription verification endpoint.

WHAT'S INCLUDED
- backend/ (Python Flask)
  - gumroad_webhook.py
  - requirements.txt
  - .env.example
  - README.md

NEXT (to finish the full product)
- web/ (PWA) will contain:
  - index.html + app.js + sw.js + manifest.json
  - offline dictionary bundle (3MB/150万語) + rules

BACKEND = NO HIDDEN STUFF
- Only these endpoints exist:
  - POST /webhook/gumroad
  - POST /verify/subscription
  - GET  /health
- No other outbound calls. No secret exfiltration.

WINDOWS QUICK RUN (BACKEND)
1) Install Python 3.11+.
2) Open PowerShell in backend/ folder.
3) Create venv:
   python -m venv .venv
4) Activate:
   .\.venv\Scripts\Activate.ps1
5) Install:
   pip install -r requirements.txt
6) Copy env:
   copy .env.example .env
   # Edit .env and set GUMROAD_WEBHOOK_SECRET
7) Run:
   python gumroad_webhook.py

GUMROAD SETUP
- Webhook URL:
  https://YOUR_DOMAIN/webhook/gumroad
- Set webhook secret in Gumroad and in .env.

POLICY PAGES
- You will want a Privacy Policy + Terms page on your site/Gumroad description.
  We can generate clean ones next based on your exact data flow.
