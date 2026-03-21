"""
Extract translation-lexicon-ish data from a Tomori backup bundle and write it
into `data/.internal/tomori_lexicon.json` so `ne_gateway.py` can use it.

This is intentionally conservative:
- It only parses JSON files.
- It supports a few common shapes for phrase translation maps.
- If nothing usable is found, it writes an empty lexicon (safe fallback).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import tempfile
import zipfile
from typing import Any


LANGS = {"en", "es", "ja", "fr", "de", "it", "ko", "zh"}


def _is_lang(x: str) -> bool:
    return isinstance(x, str) and x.lower() in LANGS


def _coerce_nested_map(obj: Any) -> dict[str, dict[str, dict[str, str]]]:
    """
    Normalize supported shapes into:
      { "en": { "es": { "hello": "hola" } } }
    Supported input shapes:
    - { "en": { "es": { "phrase": "translated", ... }, ... }, ... }
    - { "en|es": { "phrase": "translated", ... }, ... }
    - { "en|es|phrase": "translated", ... }
    """
    out: dict[str, dict[str, dict[str, str]]] = {}

    if not isinstance(obj, dict):
        return out

    # Shape 1/2: top-level from-lang or from|to
    for k, v in obj.items():
        if not isinstance(k, str):
            continue

        k_norm = k.strip().lower()

        if _is_lang(k_norm) and isinstance(v, dict):
            from_lang = k_norm
            for to_k, to_v in v.items():
                if not isinstance(to_k, str) or not isinstance(to_v, dict):
                    continue
                to_norm = to_k.strip().lower()
                if not _is_lang(to_norm):
                    continue
                for phrase, translated in to_v.items():
                    if not isinstance(phrase, str):
                        continue
                    if not isinstance(translated, str):
                        # ignore non-string translations
                        continue
                    out.setdefault(from_lang, {}).setdefault(to_norm, {})[phrase] = translated

        elif "|" in k_norm and isinstance(v, dict):
            # Shape 2: "en|es" -> { phrase: translated }
            parts = [p.strip() for p in k_norm.split("|") if p.strip()]
            if len(parts) == 2:
                from_lang, to_lang = parts
                if not (_is_lang(from_lang) and _is_lang(to_lang)):
                    continue
                if from_lang not in out:
                    out[from_lang] = {}
                if to_lang not in out[from_lang]:
                    out[from_lang][to_lang] = {}
                for phrase, translated in v.items():
                    if not isinstance(phrase, str) or not isinstance(translated, str):
                        continue
                    out[from_lang][to_lang][phrase] = translated

    # Shape 3: flat "en|es|phrase" -> "translated"
    # (Do it separately so we don't double count.)
    for k, v in obj.items():
        if not isinstance(k, str) or not isinstance(v, str):
            continue
        if k.count("|") < 2:
            continue
        parts = [p.strip() for p in k.split("|") if p.strip()]
        if len(parts) != 3:
            continue
        from_lang, to_lang, phrase = parts
        if not (_is_lang(from_lang) and _is_lang(to_lang)):
            continue
        if not phrase:
            continue
        out.setdefault(from_lang.lower(), {}).setdefault(to_lang.lower(), {})[phrase] = v

    return out


def _merge_lexicon(dst: dict[str, dict[str, dict[str, str]]], src: dict[str, dict[str, dict[str, str]]]) -> None:
    for from_lang, to_map in src.items():
        dst.setdefault(from_lang, {})
        for to_lang, phrase_map in to_map.items():
            dst[from_lang].setdefault(to_lang, {})
            dst[from_lang][to_lang].update(phrase_map)


def _iter_json_files(root: str, max_files: int = 200) -> list[str]:
    paths: list[str] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for fn in filenames:
            if fn.lower().endswith(".json"):
                paths.append(os.path.join(dirpath, fn))
            if len(paths) >= max_files:
                return paths
    return paths


def _maybe_extract_from_json_path(json_path: str) -> tuple[dict[str, dict[str, dict[str, str]]], bool]:
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            obj = json.load(f)
    except Exception:
        return {}, False

    extracted = _coerce_nested_map(obj)
    return extracted, bool(extracted)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True, help="Tomori backup zip or directory")
    ap.add_argument("--output", default=None, help="Output tomori_lexicon.json path")
    ap.add_argument("--max-json-files", type=int, default=200)
    args = ap.parse_args()

    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output = args.output or os.path.join(repo_root, "data", ".internal", "tomori_lexicon.json")

    tmp_dir = None
    extracted_root = None
    sources: list[str] = []

    if os.path.isfile(args.input) and args.input.lower().endswith(".zip"):
        tmp_dir = tempfile.mkdtemp(prefix="tomori_lexicon_")
        extracted_root = tmp_dir
        with zipfile.ZipFile(args.input, "r") as z:
            z.extractall(extracted_root)
    else:
        extracted_root = os.path.abspath(args.input)

    merged: dict[str, dict[str, dict[str, str]]] = {}
    for jp in _iter_json_files(extracted_root, max_files=args.max_json_files):
        extracted, ok = _maybe_extract_from_json_path(jp)
        if ok:
            _merge_lexicon(merged, extracted)
            sources.append(jp)

    os.makedirs(os.path.dirname(output), exist_ok=True)
    out_obj: dict[str, Any] = {"meta": {"sources": sources}}
    # Keep only the nested format keys at the top for compatibility.
    out_obj.update(merged)
    with open(output, "w", encoding="utf-8") as f:
        json.dump(out_obj, f, ensure_ascii=False, indent=2)

    print(f"wrote={output}")
    print(f"merged_from={len(sources)} json file(s)")
    total = 0
    for _fl, to_map in merged.items():
        for _tl, phrase_map in to_map.items():
            total += len(phrase_map)
    print(f"entries={total}")

    if tmp_dir:
        shutil.rmtree(tmp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()

