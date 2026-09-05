#!/usr/bin/env python3
"""Parse a Chrome/WebInspector .HAR export and extract only the X API calls.

Reads a HAR file (default: ~/Documents/PROGETTI/x.com.har), keeps just the
X/Twitter API traffic (GraphQL + REST v1.1/v2 + auth/guest), drops the noise
(video/image/js/css assets, telemetry, third-party hosts), and writes clean,
typed logs into python/logs/.

Usage:
    python3 python/parse_har.py [path/to/file.har]

Outputs (python/logs/):
  - calls.jsonl      one JSON record per API call: endpoint, method, query,
                     status, auth summary, typed request/response bodies, and a
                     `shape` type-map of the JSON response.
  - session.log      human-readable one-line-per-call log.
  - auth.json        auth material seen (bearer/csrf/guest + session cookies),
                     with secrets redacted but prefix-visible.
  - endpoints.json   tally of every endpoint with counts + status breakdown.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
LOG_DIR = HERE / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_HAR = Path.home() / "Documents" / "PROGETTI" / "x.com.har"

CALLS_FILE = LOG_DIR / "calls.jsonl"
SESSION_LOG = LOG_DIR / "session.log"
AUTH_FILE = LOG_DIR / "auth.json"
ENDPOINTS_FILE = LOG_DIR / "endpoints.json"

X_API_HOSTS = {
    "x.com", "www.x.com", "twitter.com", "www.twitter.com",
    "api.x.com", "api.twitter.com", "mobile.x.com", "mobile.twitter.com",
}

API_PATH_PREFIXES = (
    "/i/api/", "/graphql", "/2/", "/1.1/", "/oauth", "/account/", "/guest/",
    "/live_pipeline",
)

_NOISE_EXT = re.compile(
    r"\.(?:js|mjs|css|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp4|m4s|ts|map)(?:\?|$)",
    re.IGNORECASE,
)
_NOISE_PATH = re.compile(
    r"(?:/jot|/scribe|/measurement|/csp_report|/i/js_inst|/analytics|/ads/|"
    r"/1\.1/jot|/i/anonymize|/settings/push_destinations)",
    re.IGNORECASE,
)

_AUTH_HEADERS = (
    "authorization", "x-csrf-token", "x-guest-token", "x-twitter-auth-type",
    "x-twitter-active-user", "x-twitter-client-language",
    "x-client-transaction-id", "x-client-uuid",
)
_AUTH_COOKIES = ("auth_token", "ct0", "guest_id", "twid", "kdt", "att", "auth_multi")
_SECRET_COOKIES = ("auth_token", "ct0", "twid")

_MAX_BODY = 200_000


def _headers_map(headers: list[dict]) -> dict[str, str]:
    """HAR headers are a list of {name,value}; fold into a lowercased dict."""
    out: dict[str, str] = {}
    for h in headers:
        out[h.get("name", "").lower()] = h.get("value", "")
    return out


def _redact(value: str, keep: int = 6) -> str:
    if not value:
        return value
    if len(value) <= keep:
        return "*" * len(value)
    return f"{value[:keep]}...({len(value)} chars)"


def _cookies_from_header(cookie_header: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in cookie_header.split(";"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _is_x_api(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.netloc.lower() not in X_API_HOSTS:
        return False
    path = parsed.path or "/"
    if _NOISE_EXT.search(path) or _NOISE_PATH.search(path):
        return False
    return path.startswith(API_PATH_PREFIXES)


def _classify(path: str) -> str:
    p = path.lower()
    if "/graphql" in p:
        return "graphql"
    if "onboarding" in p or "/oauth" in p or "login" in p:
        return "auth"
    if "/guest/" in p:
        return "guest"
    if "/live_pipeline" in p:
        return "stream"
    if "/1.1/" in p:
        return "rest_v1.1"
    if "/2/" in p:
        return "rest_v2"
    return "api"


def _graphql_op(path: str) -> str | None:
    m = re.search(r"/graphql/[^/]+/([^/?]+)", path)
    return m.group(1) if m else None


def _parse_body(text: str | None, mime: str) -> tuple[object, str]:
    if not text:
        return None, "empty"
    if len(text) > _MAX_BODY:
        return f"<{len(text)} chars truncated>", "truncated"
    mime = (mime or "").lower()
    if "application/json" in mime or text[:1] in "{[":
        try:
            return json.loads(text), "json"
        except json.JSONDecodeError:
            return text, "text"
    if "form-urlencoded" in mime:
        return text, "form"
    return text, "text"


def _json_type_shape(value: object, depth: int = 0) -> object:
    if depth > 4:
        return "..."
    if isinstance(value, dict):
        return {k: _json_type_shape(v, depth + 1) for k, v in list(value.items())[:40]}
    if isinstance(value, list):
        if not value:
            return ["<empty>"]
        return [_json_type_shape(value[0], depth + 1), f"<list len={len(value)}>"]
    return type(value).__name__


def _post_body_text(post_data: dict | None) -> str | None:
    if not post_data:
        return None
    if "text" in post_data and post_data["text"]:
        return post_data["text"]
    params = post_data.get("params")
    if params:
        return "&".join(f"{p.get('name')}={p.get('value')}" for p in params)
    return None


def main() -> None:
    har_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HAR
    if not har_path.exists():
        sys.exit(f"HAR file not found: {har_path}")

    print(f"Reading {har_path} ({har_path.stat().st_size / 1e6:.1f} MB) ...")
    with har_path.open(encoding="utf-8") as f:
        har = json.load(f)

    entries = har.get("log", {}).get("entries", [])
    print(f"{len(entries)} total entries; filtering to X API calls ...")

    # Reset outputs for a clean run.
    for f in (CALLS_FILE, SESSION_LOG):
        if f.exists():
            f.unlink()

    endpoints: dict[str, dict] = {}
    latest_auth: dict | None = None
    kept = 0

    calls_out = CALLS_FILE.open("w", encoding="utf-8")
    session_out = SESSION_LOG.open("w", encoding="utf-8")

    for e in entries:
        req = e.get("request", {})
        resp = e.get("response", {})
        url = req.get("url", "")
        if not _is_x_api(url):
            continue

        parsed = urlparse(url)
        path = parsed.path or "/"
        endpoint = f"{parsed.scheme}://{parsed.netloc}{path}"
        kind = _classify(path)
        op = _graphql_op(path) if kind == "graphql" else None

        req_headers = _headers_map(req.get("headers", []))
        cookie_header = req_headers.get("cookie", "")
        cookies = _cookies_from_header(cookie_header)
        auth_cookies = {k: v for k, v in cookies.items() if k in _AUTH_COOKIES}

        auth_summary = {
            "bearer": _redact(req_headers.get("authorization", "")),
            "csrf_token": req_headers.get("x-csrf-token"),
            "guest_token": req_headers.get("x-guest-token"),
            "auth_type": req_headers.get("x-twitter-auth-type"),
            "logged_in_cookies": sorted(auth_cookies.keys()),
        }

        latest_auth = {
            "updated_at": e.get("startedDateTime"),
            "host": parsed.netloc,
            "bearer": _redact(req_headers.get("authorization", "")),
            "csrf_token": req_headers.get("x-csrf-token"),
            "guest_token": req_headers.get("x-guest-token"),
            "auth_type": req_headers.get("x-twitter-auth-type"),
            "active_user": req_headers.get("x-twitter-active-user"),
            "client_language": req_headers.get("x-twitter-client-language"),
            "cookies": {
                k: (_redact(v, 8) if k in _SECRET_COOKIES else v)
                for k, v in auth_cookies.items()
            },
        }

        req_body, req_type = _parse_body(
            _post_body_text(req.get("postData")),
            (req.get("postData") or {}).get("mimeType", ""),
        )
        content = resp.get("content", {}) or {}
        resp_body, resp_type = _parse_body(content.get("text"), content.get("mimeType", ""))

        query = {q.get("name"): q.get("value") for q in req.get("queryString", [])}

        record = {
            "ts": e.get("startedDateTime"),
            "kind": kind,
            "operation": op,
            "method": req.get("method"),
            "endpoint": endpoint,
            "query": query,
            "status": resp.get("status"),
            "duration_ms": round(e.get("time", 0)),
            "auth": auth_summary,
            "request": {"type": req_type, "body": req_body},
            "response": {
                "type": resp_type,
                "content_type": content.get("mimeType"),
                "shape": _json_type_shape(resp_body) if resp_type == "json" else None,
                "body": resp_body,
            },
        }
        calls_out.write(json.dumps(record, ensure_ascii=False) + "\n")

        label = op or path
        session_out.write(
            f"[{record['ts']}] {kind:9s} {req.get('method'):4s} "
            f"{resp.get('status')} {label}\n"
        )

        key = f"{req.get('method')} {endpoint}"
        rec = endpoints.setdefault(
            key, {"method": req.get("method"), "kind": kind, "count": 0, "statuses": {}}
        )
        rec["count"] += 1
        s = str(resp.get("status"))
        rec["statuses"][s] = rec["statuses"].get(s, 0) + 1
        kept += 1

    calls_out.close()
    session_out.close()

    ENDPOINTS_FILE.write_text(
        json.dumps(endpoints, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    if latest_auth:
        AUTH_FILE.write_text(
            json.dumps(latest_auth, indent=2, ensure_ascii=False), encoding="utf-8"
        )

    print(f"\nKept {kept} X API call(s). Wrote:")
    print(f"  {CALLS_FILE}")
    print(f"  {SESSION_LOG}")
    print(f"  {ENDPOINTS_FILE}")
    print(f"  {AUTH_FILE}")


if __name__ == "__main__":
    main()
