#!/usr/bin/env python3
"""Consolidate the full X session credentials into one place.

Combines:
  - the pasted DevTools Cookies table (python/cookies_table.tsv) -- this is the
    ONLY source of the HttpOnly auth_token, and
  - the JS-visible cookies from the Application dump (if parsed)

...into:
  - logs/storage/cookies_full.json  (every cookie, incl. auth_token, with meta)
  - session_cookies.txt             (Cookie-header ready for the proxy injector)

Usage:
    python3 python/consolidate_session.py
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
TSV = HERE / "cookies_table.tsv"
STORAGE = HERE / "logs" / "storage"
DUMP_COOKIES = STORAGE / "cookies.json"

FULL_OUT = STORAGE / "cookies_full.json"
SESSION_OUT = HERE / "session_cookies.txt"

# Cookies worth sending on API requests (auth + identity). We deliberately skip
# short-lived / bot-management cookies (__cf_bm, gt) that hurt more than help
# when replayed outside their original TLS session.
_SESSION_COOKIES = (
    "auth_token", "ct0", "twid", "guest_id",
    "guest_id_ads", "guest_id_marketing", "personalization_id", "d_prefs",
)


def _parse_tsv(path: Path) -> dict[str, dict]:
    """Parse a pasted DevTools cookie table (tab-separated) into name -> meta."""
    out: dict[str, dict] = {}
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        if len(cols) < 2:
            continue
        name, value = cols[0].strip(), cols[1].strip()
        meta = {"value": value}
        if len(cols) > 2:
            meta["domain"] = cols[2].strip()
        if len(cols) > 4:
            meta["expires"] = cols[4].strip()
        out[name] = meta
    return out


def main() -> None:
    table = _parse_tsv(TSV)
    if not table:
        raise SystemExit(f"No cookies parsed from {TSV}. Paste the DevTools table there.")

    # Fold in JS-visible cookies from the dump (won't override table values).
    if DUMP_COOKIES.exists():
        dump = json.loads(DUMP_COOKIES.read_text(encoding="utf-8"))
        for c in dump.get("cookieStore", []):
            name = c.get("name")
            if name and name not in table:
                table[name] = {"value": c.get("value", ""), "domain": c.get("domain")}

    has_auth = "auth_token" in table
    full = {
        "note": "Full X session cookies incl. HttpOnly auth_token (from DevTools table).",
        "auth_token_present": has_auth,
        "cookies": table,
    }
    STORAGE.mkdir(parents=True, exist_ok=True)
    FULL_OUT.write_text(json.dumps(full, indent=2, ensure_ascii=False), encoding="utf-8")

    # Build a Cookie-header ready file for the proxy injector.
    pairs = [f"{n}={table[n]['value']}" for n in _SESSION_COOKIES if n in table]
    SESSION_OUT.write_text("; ".join(pairs) + "\n", encoding="utf-8")

    print(f"Consolidated {len(table)} cookie(s). auth_token present: {has_auth}")
    print(f"  -> {FULL_OUT}")
    print(f"  -> {SESSION_OUT}  ({len(pairs)} session cookies)")
    print()
    print("Session cookies written:", ", ".join(n for n in _SESSION_COOKIES if n in table))


if __name__ == "__main__":
    main()
