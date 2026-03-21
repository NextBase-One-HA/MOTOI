# ne_gateway.py — Layer2+Layer3 + momoriri 由来フレーズ API（8888 一本）
# momoriri(ne_gateway.js) の GET /phrases 互換 + /api/phrases
import json
import os
import re
import sqlite3
import csv
import sys
import hmac
import hashlib
from datetime import datetime, timezone

from flask import Flask, Response, jsonify, request

_BASE = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(_BASE, "evidence.db")
PHRASES_FILE = os.path.join(_BASE, "data", "generated_phrases.json")
TEMPLATES_DIR = os.path.join(_BASE, "templates")
LEXICON_FILE = os.path.join(_BASE, "data", ".internal", "tomori_lexicon.json")
DICT150_CSV_FILE = os.path.join(_BASE, "data", ".internal", "custom_dictionary_150.csv")

_150_INDEX = None
_150_MAX_OPTIONS = 12
_150_TOKEN_RE = re.compile(r"[a-zA-Z']+")

# Scene keywords are best-effort heuristics: we map dictionary rows to scenes by
# matching scene keyword substrings in the dictionary's English `source`.
_150_SCENE_KEYWORDS: dict[str, list[str]] = {
    "hotel": [
        "check", "check-in", "checkout", "reservation", "breakfast", "towel",
        "wifi", "room", "guest", "password", "late checkout",
        "front desk", "desk",
    ],
    "transport": [
        "train", "bus", "station", "airport", "taxi", "route", "terminal", "ticket",
    ],
    "shopping": [
        "shop", "store", "market", "price", "buy", "purchase", "cashier",
    ],
    "dining": [
        "breakfast", "lunch", "dinner", "menu", "restaurant", "table",
    ],
}


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DUMMY_TM = {
    "case_id": "demo-001",
    "reviewed": True,
    "payload": "SUCCESS",
    "updated_at": _utc_now_iso(),
}

app = Flask(__name__)
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()


def _stripe_verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    """Verify Stripe-Signature header using HMAC SHA256."""
    if not secret:
        # Dev mode: allow unsigned webhook if secret is not set.
        return True
    if not signature_header:
        return False
    try:
        items = {}
        for part in signature_header.split(","):
            if "=" not in part:
                continue
            k, v = part.split("=", 1)
            items[k.strip()] = v.strip()
        ts = items.get("t", "")
        v1 = items.get("v1", "")
        if not ts or not v1:
            return False
        payload = ts.encode("utf-8") + b"." + raw_body
        expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, v1)
    except Exception:
        return False


def _stripe_sub_key(customer_id: str, email: str, subscription_id: str) -> str:
    if subscription_id:
        return f"sub:{subscription_id}"
    if customer_id:
        return f"cus:{customer_id}"
    return f"email:{email.lower()}" if email else "unknown"


def _upsert_subscription(
    customer_id: str,
    email: str,
    subscription_id: str,
    status: str,
    plan_code: str,
    price_id: str,
    current_period_end: str,
    cancel_at_period_end: bool,
    event_type: str,
) -> None:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    sub_key = _stripe_sub_key(customer_id, email, subscription_id)
    c.execute(
        """
        INSERT INTO billing_subscriptions(
            sub_key, customer_id, email, subscription_id, status, plan_code, price_id,
            current_period_end, cancel_at_period_end, last_event_type, updated_at
        ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sub_key) DO UPDATE SET
            customer_id=excluded.customer_id,
            email=excluded.email,
            subscription_id=excluded.subscription_id,
            status=excluded.status,
            plan_code=excluded.plan_code,
            price_id=excluded.price_id,
            current_period_end=excluded.current_period_end,
            cancel_at_period_end=excluded.cancel_at_period_end,
            last_event_type=excluded.last_event_type,
            updated_at=excluded.updated_at
        """,
        (
            sub_key,
            customer_id or None,
            email or None,
            subscription_id or None,
            status or "unknown",
            plan_code or "unknown",
            price_id or "",
            current_period_end or "",
            int(bool(cancel_at_period_end)),
            event_type,
            _utc_now_iso(),
        ),
    )
    conn.commit()
    conn.close()


@app.route("/api/billing/webhook/stripe", methods=["POST", "OPTIONS"])
def api_billing_webhook_stripe():
    if request.method == "OPTIONS":
        return "", 204

    raw_body = request.get_data(cache=False) or b""
    sig = request.headers.get("Stripe-Signature", "")
    if not _stripe_verify_signature(raw_body, sig, STRIPE_WEBHOOK_SECRET):
        return jsonify({"error": "invalid_signature"}), 401

    try:
        event = json.loads(raw_body.decode("utf-8"))
    except Exception:
        return jsonify({"error": "invalid_json"}), 400

    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "unknown")
    data_obj = event.get("data", {}).get("object", {}) if isinstance(event.get("data"), dict) else {}
    if not isinstance(data_obj, dict):
        data_obj = {}

    # Persist raw event first (best-effort dedupe by event_id).
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute(
            """
            INSERT OR IGNORE INTO stripe_webhook_events(event_id, event_type, customer_id, email, payload, created_at)
            VALUES(?, ?, ?, ?, ?, ?)
            """,
            (
                event_id or f"evt-local-{int(datetime.now().timestamp())}",
                event_type,
                str(data_obj.get("customer") or ""),
                str(data_obj.get("customer_email") or data_obj.get("receipt_email") or ""),
                json.dumps(event, ensure_ascii=False)[:20000],
                _utc_now_iso(),
            ),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass

    customer_id = str(data_obj.get("customer") or "")
    email = str(data_obj.get("customer_email") or data_obj.get("receipt_email") or "")
    subscription_id = str(data_obj.get("subscription") or data_obj.get("id") or "")
    status = "unknown"
    plan_code = "unknown"
    price_id = ""
    current_period_end = ""
    cancel_at_period_end = False

    # checkout.session.completed
    if event_type == "checkout.session.completed":
        status = "active"
        subscription_id = str(data_obj.get("subscription") or subscription_id)
        lines = data_obj.get("display_items") or []
        if isinstance(lines, list) and lines:
            try:
                plan_code = str(lines[0].get("plan", {}).get("id") or "unknown")
            except Exception:
                pass

    # invoice.paid / invoice.payment_failed
    elif event_type in {"invoice.paid", "invoice.payment_failed"}:
        status = "active" if event_type == "invoice.paid" else "past_due"
        subscription_id = str(data_obj.get("subscription") or subscription_id)
        lines = data_obj.get("lines", {}).get("data", []) if isinstance(data_obj.get("lines"), dict) else []
        if isinstance(lines, list) and lines:
            line0 = lines[0] if isinstance(lines[0], dict) else {}
            price_id = str(line0.get("price", {}).get("id") or "")
            plan_code = str(line0.get("plan", {}).get("id") or plan_code)
            cpe = line0.get("period", {}).get("end")
            if isinstance(cpe, (int, float)):
                current_period_end = datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat()

    # customer.subscription.deleted / updated / created
    elif event_type.startswith("customer.subscription."):
        subscription_id = str(data_obj.get("id") or subscription_id)
        status = str(data_obj.get("status") or "unknown")
        cancel_at_period_end = bool(data_obj.get("cancel_at_period_end"))
        items = data_obj.get("items", {}).get("data", []) if isinstance(data_obj.get("items"), dict) else []
        if isinstance(items, list) and items:
            it0 = items[0] if isinstance(items[0], dict) else {}
            price_id = str(it0.get("price", {}).get("id") or "")
            plan_code = str(it0.get("plan", {}).get("id") or plan_code)
        cpe = data_obj.get("current_period_end")
        if isinstance(cpe, (int, float)):
            current_period_end = datetime.fromtimestamp(cpe, tz=timezone.utc).isoformat()

    # Keep plan_code stable if unknown
    _upsert_subscription(
        customer_id=customer_id,
        email=email,
        subscription_id=subscription_id,
        status=status,
        plan_code=plan_code,
        price_id=price_id,
        current_period_end=current_period_end,
        cancel_at_period_end=cancel_at_period_end,
        event_type=event_type,
    )
    return jsonify({"ok": True, "event_type": event_type, "subscription_id": subscription_id or None}), 200


@app.route("/api/billing/summary", methods=["GET", "OPTIONS"])
def api_billing_summary():
    if request.method == "OPTIONS":
        return "", 204

    email = (request.args.get("email") or "").strip().lower()
    customer_id = (request.args.get("customer_id") or "").strip()
    device_id = (request.args.get("device_id") or "").strip()

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # Subscription lookup
    sub = None
    if email:
        c.execute(
            """
            SELECT status, plan_code, subscription_id, customer_id, email, current_period_end, cancel_at_period_end, updated_at
            FROM billing_subscriptions
            WHERE lower(email)=?
            ORDER BY updated_at DESC LIMIT 1
            """,
            (email,),
        )
        sub = c.fetchone()
    elif customer_id:
        c.execute(
            """
            SELECT status, plan_code, subscription_id, customer_id, email, current_period_end, cancel_at_period_end, updated_at
            FROM billing_subscriptions
            WHERE customer_id=?
            ORDER BY updated_at DESC LIMIT 1
            """,
            (customer_id,),
        )
        sub = c.fetchone()

    # Translate usage totals (gacha usage)
    if device_id:
        c.execute(
            "SELECT COUNT(*), SUM(CASE WHEN miss=1 THEN 1 ELSE 0 END) FROM api_translate_logs WHERE device_id=?",
            (device_id,),
        )
        total_calls, miss_calls = c.fetchone()
    else:
        c.execute("SELECT COUNT(*), SUM(CASE WHEN miss=1 THEN 1 ELSE 0 END) FROM api_translate_logs")
        total_calls, miss_calls = c.fetchone()
    total_calls = int(total_calls or 0)
    miss_calls = int(miss_calls or 0)
    hit_calls = max(0, total_calls - miss_calls)

    conn.close()

    out = {
        "ok": True,
        "subscription": None,
        "usage": {
            "device_id": device_id or None,
            "total_api_calls": total_calls,
            "hit_calls": hit_calls,
            "miss_calls": miss_calls,
        },
    }
    if sub:
        out["subscription"] = {
            "status": sub[0],
            "plan_code": sub[1],
            "subscription_id": sub[2],
            "customer_id": sub[3],
            "email": sub[4],
            "current_period_end": sub[5],
            "cancel_at_period_end": bool(sub[6]),
            "updated_at": sub[7],
        }
    return jsonify(out), 200


@app.after_request
def _cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    return resp


@app.route("/health")
def health():
    return jsonify({"ok": True, "service": "ne_gateway"}), 200


def _load_phrases_raw() -> object | None:
    if not os.path.isfile(PHRASES_FILE):
        return None
    with open(PHRASES_FILE, encoding="utf-8") as f:
        return json.load(f)


def _phrases_list(blob: object, scene: str) -> list:
    if isinstance(blob, list):
        return blob
    if isinstance(blob, dict):
        if scene and scene in blob and isinstance(blob[scene], list):
            return blob[scene]
        if "phrases" in blob and isinstance(blob["phrases"], list):
            return blob["phrases"]
        merged: list = []
        for v in blob.values():
            if isinstance(v, list):
                merged.extend(v)
        return merged
    return []


def _load_scene_templates() -> dict[str, list[str]]:
    """Load scene phrases from local `templates/<scene>.json`."""
    out: dict[str, list[str]] = {}
    try:
        if not os.path.isdir(TEMPLATES_DIR):
            return out
        for fn in os.listdir(TEMPLATES_DIR):
            if not fn.lower().endswith(".json"):
                continue
            scene = os.path.splitext(fn)[0]
            path = os.path.join(TEMPLATES_DIR, fn)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    j = json.load(f)
                phrases = j.get("phrases")
                if isinstance(phrases, list):
                    out[scene] = [str(x) for x in phrases if isinstance(x, (str, int, float))]
            except Exception:
                continue
    except Exception:
        pass
    return out


_SCENE_TEMPLATES = _load_scene_templates()


def _load_scene_phrases(scene: str | None) -> list[str]:
    """Return phrase candidates for a scene (templates + generated_phrases.json)."""
    phrases: list[str] = []

    if scene:
        t = _SCENE_TEMPLATES.get(scene)
        if isinstance(t, list):
            phrases.extend([str(x) for x in t])

    raw = _load_phrases_raw()
    if raw is not None:
        # _phrases_list merges all list-valued items when dict doesn't have scene.
        phrases.extend([str(x) for x in _phrases_list(raw, scene or "") if isinstance(x, (str, int, float))])

    # De-dupe while preserving order.
    seen: set[str] = set()
    out: list[str] = []
    for p in phrases:
        if p in seen:
            continue
        seen.add(p)
        out.append(p)
    return out


def _token_match(word: str, phrase: str) -> bool:
    w = (word or "").strip()
    p = (phrase or "").strip()
    if not w or not p:
        return False
    tokens = [t for t in re.split(r"\s+", w) if t]
    if not tokens:
        return False
    pl = p.lower()
    return any(t.lower() in pl for t in tokens)

def _load_tomori_lexicon() -> dict | None:
    """Load optional external lexicon (phrase translation map).

    Expected formats (any one is accepted):
    - { "en": { "es": { "hello": "hola", ... } } }
    - { "en|es": { "hello": "hola", ... } }
    - { "en|es|hello": "hola", ... }
    """
    if not os.path.isfile(LEXICON_FILE):
        return None
    try:
        with open(LEXICON_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except Exception:
        # If the external lexicon is malformed, fall back to built-in demo table.
        return None


def _150_scene_for_source(src_en: str) -> str:
    s = (src_en or "").lower()
    for scene, kws in _150_SCENE_KEYWORDS.items():
        for kw in kws:
            if kw in s:
                return scene
    return "general"


def _150_tokens_from_trigger(trigger: str) -> list[str]:
    t = (trigger or "").lower()
    toks = _150_TOKEN_RE.findall(t)
    # Single-word triggers are preferred; keep only longer tokens.
    toks = [x for x in toks if len(x) >= 2]
    # Also try the whole trigger as a phrase key (useful for "late checkout").
    phrase = t.strip()
    if " " in phrase and 2 <= len(phrase) <= 40:
        toks.insert(0, phrase)
    return toks[:8]


def _150_build_index() -> dict[str, dict[str, list[str]]]:
    """
    Build an in-memory trigger index from custom_dictionary_150.csv.
    Returns: { scene: { token_or_phrase: [target_ja, ...] } }
    """
    if not os.path.isfile(DICT150_CSV_FILE):
        return {}

    idx: dict[str, dict[str, list[str]]] = {}

    def add_option(scene: str, token: str, target: str) -> None:
        scene_map = idx.setdefault(scene, {})
        options = scene_map.setdefault(token, [])
        if target in options:
            return
        if len(options) >= _150_MAX_OPTIONS:
            return
        options.append(target)

    with open(DICT150_CSV_FILE, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            src = (row.get("source") or "").strip()
            tgt = (row.get("target") or "").strip()
            fr = (row.get("from") or "").strip()
            to = (row.get("to") or "").strip()
            if not src or not tgt:
                continue
            # This package is meant for on-device EN -> JA.
            if fr and to and (fr != "en" or to != "ja"):
                continue

            scene = _150_scene_for_source(src)
            tokens = _150_tokens_from_trigger(src)
            if not tokens:
                continue

            for tk in set(tokens):
                add_option(scene, tk, tgt)

    return idx


def _150_get_index() -> dict[str, dict[str, list[str]]]:
    global _150_INDEX
    if _150_INDEX is None:
        _150_INDEX = _150_build_index()
    return _150_INDEX


def _lex_lookup(lex: dict, text: str, from_lang: str, to_lang: str) -> str | None:
    variants = [text]
    if from_lang in {"en", "es", "de", "fr", "pt"}:
        variants = [text.lower(), text]

    # Format A: lex[from][to][phrase] = translated
    try:
        m_from = lex.get(from_lang)
        if isinstance(m_from, dict):
            m_to = m_from.get(to_lang)
            if isinstance(m_to, dict):
                for v in variants:
                    if v in m_to:
                        return str(m_to[v])
    except Exception:
        pass

    # Format B: lex["from|to"][phrase] = translated
    try:
        m = lex.get(f"{from_lang}|{to_lang}")
        if isinstance(m, dict):
            for v in variants:
                if v in m:
                    return str(m[v])
    except Exception:
        pass

    # Format C: lex["from|to|phrase"] = translated
    for v in variants:
        try:
            key = f"{from_lang}|{to_lang}|{v}"
            if key in lex:
                return str(lex[key])
        except Exception:
            continue

    return None


_TOMORI_LEXICON = _load_tomori_lexicon()


@app.route("/phrases")
def phrases_momoriri_compat():
    """momoriri ne_gateway.js 互換: JSON ファイルをそのまま返す。"""
    try:
        with open(PHRASES_FILE, "rb") as f:
            return Response(f.read(), mimetype="application/json; charset=utf-8")
    except FileNotFoundError:
        return jsonify({"error": "Data could not be read"}), 500


@app.route("/api/phrases")
def api_phrases():
    scene = (request.args.get("scene") or "").strip()
    lang = (request.args.get("lang") or "").strip()
    blob = _load_phrases_raw()
    if blob is None:
        return jsonify({"error": "phrases_missing", "phrases": []}), 500
    phrases = _phrases_list(blob, scene)
    if lang and phrases and isinstance(phrases[0], dict) and "lang" in phrases[0]:
        phrases = [p for p in phrases if isinstance(p, dict) and p.get("lang") == lang]
    return jsonify({"phrases": phrases, "scene": scene or None, "lang": lang or None})


@app.route("/api/templates/<name>")
def api_template(name: str):
    if not re.fullmatch(r"[a-z0-9_]+", name, re.I):
        return jsonify({"error": "invalid_template"}), 400
    path = os.path.join(TEMPLATES_DIR, f"{name}.json")
    if not os.path.isfile(path):
        return jsonify({"error": "not_found", "name": name}), 404
    with open(path, encoding="utf-8") as f:
        return Response(f.read(), mimetype="application/json; charset=utf-8")


@app.route("/api/dict/bootstrap", methods=["GET"])
def api_dict_bootstrap():
    """空辞書シェル: 端末側でユーザー辞書とマージする前提のメタだけ返す。"""
    return jsonify(
        {
            "version": 1,
            "schema": "one-coffee-lexicon-v1",
            "entries": [],
            "note": "entries は空。端末の user_lexicon に蓄積し、シリーズ間でエクスポート想定。",
        }
    )


def _demo_translate(text: str, from_lang: str, to_lang: str) -> tuple[str, bool]:
    """(訳文, ヒットしたか)。未ヒットは原文を返し miss 扱い。"""
    t = text.strip()
    if not t:
        return "", True
    if from_lang == to_lang:
        return t, True

    # External lexicon (Tomori salvage) takes priority.
    if _TOMORI_LEXICON:
        hit = _lex_lookup(_TOMORI_LEXICON, t, from_lang, to_lang)
        if hit is not None:
            return hit, True

    table: dict[tuple[str, str], dict[str, str]] = {
        ("en", "es"): {"hello": "hola", "thank you": "gracias", "goodbye": "adiós"},
        ("en", "ja"): {"hello": "こんにちは", "thank you": "ありがとう", "bad": "まずい", "not good": "良くない"},
        ("en", "fr"): {"hello": "Bonjour", "thank you": "Merci", "goodbye": "Au revoir"},
        ("en", "de"): {"hello": "Hallo", "thank you": "Danke", "goodbye": "Auf Wiedersehen"},
        ("en", "it"): {"hello": "Ciao", "thank you": "Grazie", "goodbye": "Arrivederci"},
        ("en", "ko"): {"hello": "안녕하세요", "thank you": "감사합니다", "goodbye": "안녕"},
        ("en", "zh"): {"hello": "你好", "thank you": "谢谢", "goodbye": "再见"},
        ("ja", "en"): {
            "こんにちは": "Hello",
            "ありがとう": "Thank you",
            "まずい": "Not good. (taste or situation.)",
        },
    }
    row = table.get((from_lang, to_lang))
    if not row:
        return t, False
    probe = t.lower() if from_lang in {"en", "es", "de", "fr", "it", "pt"} else t
    hit = row.get(probe) or row.get(t)
    if hit:
        return hit, True
    return t, False


_NEG_RE = re.compile(
    r"(怒り|憎しみ|大嫌い|嫌い|ムカつく|腹立つ|イライラ|憎む|殺意|hate|hates|hated|angry|furious|despise)",
    re.IGNORECASE,
)


def _soften_negative(text: str) -> str:
    """Best-effort local dampening so community messages stay friendly."""
    if not _NEG_RE.search(text or ""):
        return text

    prefix = "気持ちはわかるよ。落ち着いて伝えるね。"
    s = str(text)

    # Light token substitutions (keep semantics but reduce harshness).
    s = s.replace("怒り", "つらさ")
    s = s.replace("憎しみ", "モヤモヤ")
    s = s.replace("大嫌い", "苦手です")
    s = s.replace("嫌い", "合わないと思う")
    s = s.replace("ムカつく", "気になります")
    s = s.replace("腹立つ", "つらい")
    s = s.replace("イライラ", "モヤモヤ")

    s = re.sub(r"\bhate\b", "really dislike", s, flags=re.IGNORECASE)
    s = re.sub(r"\bangry\b", "upset", s, flags=re.IGNORECASE)
    s = re.sub(r"\bfurious\b", "really upset", s, flags=re.IGNORECASE)
    s = re.sub(r"\bdespise\b", "really dislike", s, flags=re.IGNORECASE)

    if s.startswith(prefix):
        return s
    return f"{prefix}\n{s}"


@app.route("/api/translate", methods=["POST", "OPTIONS"])
def api_translate():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    from_lang = (data.get("from") or "en").strip()[:16]
    to_lang = (data.get("to") or "es").strip()[:16]
    device_id = (data.get("device_id") or "unknown").strip()[:64]
    if not text:
        return jsonify({"error": "empty_text"}), 400
    print(f"[api/translate] {from_lang!s}->{to_lang!s} {text!r}", flush=True)
    out, ok = _demo_translate(text, from_lang, to_lang)
    # Record gateway-side translation history for product analytics / growth loop.
    # Never fail the API response if logging fails.
    try:
        conn = sqlite3.connect(DB_FILE)
        c = conn.cursor()
        c.execute(
            """
            INSERT INTO api_translate_logs(created_at, device_id, from_lang, to_lang, text, translated, miss)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            """,
            (_utc_now_iso(), device_id, from_lang, to_lang, text[:500], str(out)[:500], int(not ok)),
        )
        conn.commit()
        conn.close()
    except Exception:
        pass
    return jsonify(
        {
            "from": from_lang,
            "to": to_lang,
            "text": text,
            "translated": out,
            "miss": not ok,
            "source": "gateway",
        }
    )


@app.route("/api/greetings", methods=["GET", "POST", "OPTIONS"])
def api_greetings():
    if request.method == "OPTIONS":
        return "", 204

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    # GET: latest messages
    if request.method == "GET":
        try:
            limit = int((request.args.get("limit") or "20").strip())
        except Exception:
            limit = 20
        limit = max(1, min(limit, 50))

        c.execute(
            "SELECT id, created_at, text FROM smile_messages ORDER BY id DESC LIMIT ?",
            (limit,),
        )
        rows = c.fetchall()
        conn.close()
        msgs = [{"id": int(r[0]), "created_at": r[1], "text": r[2]} for r in rows]
        return jsonify({"ok": True, "messages": msgs}), 200

    # POST: submit new message
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        conn.close()
        return jsonify({"error": "empty_text"}), 400

    # Keep community payload small and safe.
    text = text[:280]
    text = _soften_negative(text)

    c.execute(
        "INSERT INTO smile_messages(created_at, text) VALUES(?, ?)",
        (_utc_now_iso(), text),
    )
    conn.commit()
    new_id = c.lastrowid
    conn.close()

    return jsonify({"ok": True, "id": int(new_id), "text": text}), 200


@app.route("/api/150/scenes", methods=["GET", "OPTIONS"])
def api_150_scenes():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"ok": True, "scenes": sorted(_150_SCENE_KEYWORDS.keys()) + ["general"]}), 200


@app.route("/api/150/options", methods=["GET", "OPTIONS"])
def api_150_options():
    if request.method == "OPTIONS":
        return "", 204

    scene = (request.args.get("scene") or "hotel").strip().lower()
    trigger = (request.args.get("trigger") or "").strip()
    if not trigger:
        return jsonify({"ok": True, "options": []}), 200

    if scene not in _150_SCENE_KEYWORDS:
        scene = "general"

    idx = _150_get_index()
    scene_map = idx.get(scene, {})

    # Try token keys from the user trigger, then merge results with order-preserving dedupe.
    wanted = _150_tokens_from_trigger(trigger)
    options: list[str] = []
    seen: set[str] = set()
    for tk in wanted:
        for opt in scene_map.get(tk, []):
            if opt in seen:
                continue
            seen.add(opt)
            options.append(opt)
            if len(options) >= 20:
                break
        if len(options) >= 20:
            break

    return jsonify({"ok": True, "scene": scene, "trigger": trigger, "options": options[:20]}), 200


def init_db() -> None:
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute(
        """
    CREATE TABLE IF NOT EXISTS tm_deliveries (
        case_id TEXT PRIMARY KEY,
        reviewed INTEGER,
        payload TEXT,
        updated_at TEXT
    )
    """
    )
    c.execute("SELECT COUNT(*) FROM tm_deliveries")
    if c.fetchone()[0] == 0:
        c.execute(
            """
        INSERT INTO tm_deliveries(case_id, reviewed, payload, updated_at)
        VALUES(?, ?, ?, ?)
        """,
            (
                DUMMY_TM["case_id"],
                int(DUMMY_TM["reviewed"]),
                DUMMY_TM["payload"],
                DUMMY_TM["updated_at"],
            ),
        )
    conn.commit()
    conn.close()

    # Create greetings table too (separate commit to keep init_db simple).
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS smile_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            text TEXT NOT NULL
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS api_translate_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            device_id TEXT NOT NULL,
            from_lang TEXT NOT NULL,
            to_lang TEXT NOT NULL,
            text TEXT NOT NULL,
            translated TEXT NOT NULL,
            miss INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS stripe_webhook_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            customer_id TEXT,
            email TEXT,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS billing_subscriptions (
            sub_key TEXT PRIMARY KEY,
            customer_id TEXT,
            email TEXT,
            subscription_id TEXT,
            status TEXT NOT NULL,
            plan_code TEXT,
            price_id TEXT,
            current_period_end TEXT,
            cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
            last_event_type TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.commit()
    conn.close()


# ブラウザ直叩き用（アプリの接続判定は /health の JSON のまま）
_NE_ROOT_HTML = """<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NE Gateway</title>
  <style>
    body { font-family: system-ui, "Segoe UI", sans-serif; background:#070708; color:#e4c77a;
           margin:0; padding: max(24px, env(safe-area-inset-top)) 20px 32px; line-height:1.55; }
    h1 { font-size: 1.15rem; letter-spacing: .12em; margin: 0 0 12px; }
    .ok { color:#9ddea8; font-weight: 600; margin: 0 0 16px; }
    p { color:#c9c5bc; margin: 10px 0; max-width: 36rem; font-size: 15px; }
    code { background:#111; color:#f2f0eb; padding: .15em .45em; border-radius: 6px; font-size: 13px; }
    a { color:#e4c77a; }
    .links { margin-top: 20px; display: flex; flex-wrap: wrap; gap: 12px; }
    .links a { padding: 10px 14px; border: 1px solid rgba(228,199,122,.4); border-radius: 10px;
              text-decoration: none; font-weight: 600; }
    .links a:hover { background: rgba(255,255,255,.06); }
    .tiny { font-size: 12px; color:#8a8680; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>NE Gateway（BEE）</h1>
  <p class="ok">稼働中 — TOMORI_ENGINE_LAYER_2</p>
  <p>One coffee GLB などのフロントは <code>GET /health</code> の JSON（<code>ok: true</code>）で接続を見ています。</p>
  <div class="links">
    <a href="/health">/health（JSON）</a>
    <a href="/?plain=1">平文ステータス（従来）</a>
  </div>
  <p class="tiny">API: <code>/api/translate</code> · <code>/api/phrases</code> · <code>/complete</code> など</p>
</body>
</html>"""


@app.route("/")
def layer2():
    if (request.args.get("plain") or "").strip() == "1":
        return "TOMORI_ENGINE_LAYER_2_ONLINE\n", 200, {"Content-Type": "text/plain; charset=utf-8"}
    return Response(_NE_ROOT_HTML, mimetype="text/html; charset=utf-8")


@app.route("/complete", methods=["GET", "POST", "OPTIONS"])
def complete():
    if request.method == "OPTIONS":
        return "", 204
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    if request.method == "GET":
        case_id = (request.args.get("case_id") or "").strip()
    else:
        data = request.get_json(silent=True)
        case_id = ""
        if isinstance(data, dict):
            case_id = str(data.get("case_id") or "").strip()

    if not case_id:
        conn.close()
        return jsonify({"error": "missing_case_id"}), 400

    c.execute(
        "SELECT case_id, reviewed, payload, updated_at FROM tm_deliveries WHERE case_id=?",
        (case_id,),
    )
    row = c.fetchone()
    conn.close()

    if not row:
        return jsonify({"error": "not_found", "case_id": case_id}), 404

    resp = {
        "case_id": row[0],
        "reviewed": bool(row[1]),
        "payload": row[2],
        "updated_at": row[3],
    }
    return jsonify(resp), 200


if __name__ == "__main__":
    init_db()
    port = 8888
    if "--port" in sys.argv:
        port = int(sys.argv[sys.argv.index("--port") + 1])
    print(f"--- BE-V-ENGINE: PORT {port} ACTIVE ---")
    app.run(host="0.0.0.0", port=port)
