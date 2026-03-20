# ne_gateway.py — Layer2+Layer3 + momoriri 由来フレーズ API（8888 一本）
# momoriri(ne_gateway.js) の GET /phrases 互換 + /api/phrases
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone

from flask import Flask, Response, jsonify, request

_BASE = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(_BASE, "evidence.db")
PHRASES_FILE = os.path.join(_BASE, "data", "generated_phrases.json")
TEMPLATES_DIR = os.path.join(_BASE, "templates")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


DUMMY_TM = {
    "case_id": "demo-001",
    "reviewed": True,
    "payload": "SUCCESS",
    "updated_at": _utc_now_iso(),
}

app = Flask(__name__)


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
    table: dict[tuple[str, str], dict[str, str]] = {
        ("en", "es"): {"hello": "hola", "thank you": "gracias", "goodbye": "adiós"},
        ("en", "ja"): {"hello": "こんにちは", "thank you": "ありがとう"},
        ("ja", "en"): {"こんにちは": "Hello", "ありがとう": "Thank you"},
    }
    row = table.get((from_lang, to_lang))
    if not row:
        return t, False
    probe = t.lower() if from_lang in {"en", "es", "de", "fr", "pt"} else t
    hit = row.get(probe) or row.get(t)
    if hit:
        return hit, True
    return t, False


@app.route("/api/translate", methods=["POST", "OPTIONS"])
def api_translate():
    if request.method == "OPTIONS":
        return "", 204
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    from_lang = (data.get("from") or "en").strip()[:16]
    to_lang = (data.get("to") or "es").strip()[:16]
    if not text:
        return jsonify({"error": "empty_text"}), 400
    out, ok = _demo_translate(text, from_lang, to_lang)
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


@app.route("/")
def layer2():
    return "TOMORI_ENGINE_LAYER_2_ONLINE", 200


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
