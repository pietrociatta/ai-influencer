#!/usr/bin/env python3
"""Parse the browser 'Application' storage dump (x-application-dump.json) into
clean, separated files under python/logs/storage/.

The dump is produced by the console snippet (cookies + localStorage +
sessionStorage + IndexedDB). This splits it into readable pieces and prints a
summary. Note: HttpOnly cookies (auth_token) are never in the dump -- the
browser hides them from JS. Those come from the DevTools Cookies table.

Usage:
    python3 python/parse_dump.py [path/to/x-application-dump.json]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DUMP = HERE / "x-application-dump.json"
OUT_DIR = HERE / "logs" / "storage"

_SECRET_HINT = ("token", "ct0", "auth", "secret", "id")


def _write(name: str, obj: object) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    p = OUT_DIR / name
    p.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    return p


def main() -> None:
    dump_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DUMP
    if not dump_path.exists():
        sys.exit(f"Dump not found: {dump_path}")

    d = json.loads(dump_path.read_text(encoding="utf-8"))

    # --- cookies (from cookieStore + document.cookie) ---
    cookie_store = d.get("cookieStore") or []
    doc_cookies = {}
    for part in (d.get("cookies_document") or "").split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            doc_cookies[k.strip()] = v.strip()
    cookies = {
        "cookieStore": cookie_store,
        "document_cookie": doc_cookies,
        "note": (
            "HttpOnly cookies (e.g. auth_token) are NOT here -- the browser "
            "hides them from JavaScript. Read those from DevTools > Application "
            "> Cookies table."
        ),
    }
    _write("cookies.json", cookies)

    # --- local / session storage ---
    _write("local_storage.json", d.get("localStorage", {}))
    _write("session_storage.json", d.get("sessionStorage", {}))

    # --- indexeddb (one file per db) ---
    idb = d.get("indexedDB", {})
    for db_name, stores in idb.items():
        safe = db_name.replace("/", "_")
        _write(f"indexeddb_{safe}.json", stores)

    # --- summary ---
    print(f"Parsed {dump_path.name}  (captured {d.get('capturedAt')}, url {d.get('url')})")
    print("=" * 64)
    print(f"Wrote separated files to: {OUT_DIR}")
    print()

    print(f"Cookies (JS-visible): {len(cookie_store)}")
    for c in cookie_store:
        name = c.get("name")
        val = c.get("value", "")
        shown = f"{val[:10]}...({len(val)})" if any(h in name.lower() for h in _SECRET_HINT) and len(val) > 12 else val
        print(f"  {name:22s} {shown}")
    print("  auth_token           <HttpOnly -- not in dump; from Cookies table>")
    print()

    print(f"localStorage keys: {len(d.get('localStorage', {}))}")
    for k, v in d.get("localStorage", {}).items():
        print(f"  {k}: {str(v)[:80]}")
    print()

    print("IndexedDB:")
    for db_name, stores in idb.items():
        if isinstance(stores, dict):
            for s, rows in stores.items():
                n = len(rows) if isinstance(rows, list) else "?"
                print(f"  {db_name}/{s}: {n} rows")
        else:
            print(f"  {db_name}: {stores}")


if __name__ == "__main__":
    main()
