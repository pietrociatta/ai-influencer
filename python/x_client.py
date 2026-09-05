#!/usr/bin/env python3
"""Authenticated X (Twitter) web-API client using a browser session.

X's web app does NOT use OAuth access/refresh tokens. It authenticates with:
  - the auth_token cookie   (your durable login; no refresh token exists --
                             it stays valid until it expires or you log out)
  - the ct0 cookie          (CSRF; also sent as the x-csrf-token header)
  - a PUBLIC bearer token   (hardcoded in x.com's JS -- same for every user)

This client loads your cookies from python/session_cookies.txt and replays the
same GraphQL calls your browser made (query ids + feature flags were taken from
the captured HAR, so they match what the web app actually sends).

Usage:
    python3 python/x_client.py user paradislabs      # UserByScreenName
    python3 python/x_client.py verify                # confirm the session works
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib import error, parse, request

HERE = Path(__file__).resolve().parent
SESSION_FILE = HERE / "session_cookies.txt"

# Public web bearer token used by x.com's own frontend (not a secret; identical
# for all web clients). If X rotates it, copy a fresh one from any request's
# Authorization header in DevTools.
BEARER = (
    "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D"
    "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)

BASE = "https://x.com/i/api/graphql"

# GraphQL query ids + default feature flags captured from the live session HAR.
# Query ids change over time; if a call starts 404ing, refresh these from a new
# capture (the id is the path segment before the operation name).
QUERIES = {
    "UserByScreenName": {
        "qid": "2qvSHpkWTMS9i0zJAwDNiA",
        "features": {
            "hidden_profile_subscriptions_enabled": True,
            "profile_label_improvements_pcf_label_in_post_enabled": True,
            "responsive_web_profile_redirect_enabled": False,
            "rweb_tipjar_consumption_enabled": False,
            "verified_phone_label_enabled": False,
            "subscriptions_verification_info_is_identity_verified_enabled": True,
            "subscriptions_verification_info_verified_since_enabled": True,
            "highlights_tweets_tab_ui_enabled": True,
            "responsive_web_twitter_article_notes_tab_enabled": True,
            "subscriptions_feature_can_gift_premium": True,
            "creator_subscriptions_tweet_preview_api_enabled": True,
            "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
            "responsive_web_graphql_timeline_navigation_enabled": True,
        },
        "fieldToggles": {"withPayments": False, "withAuxiliaryUserLabels": True},
    },
}


def load_cookies() -> dict[str, str]:
    if not SESSION_FILE.exists():
        sys.exit(f"No session file at {SESSION_FILE}. Run consolidate_session.py first.")
    text = SESSION_FILE.read_text(encoding="utf-8").strip()
    if text.lower().startswith("cookie:"):
        text = text.split(":", 1)[1].strip()
    jar: dict[str, str] = {}
    for part in text.replace("\n", ";").split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            jar[k.strip()] = v.strip()
    if "auth_token" not in jar or "ct0" not in jar:
        sys.exit("session_cookies.txt is missing auth_token and/or ct0.")
    return jar


def _headers(jar: dict[str, str]) -> dict[str, str]:
    return {
        "authorization": BEARER,
        "x-csrf-token": jar["ct0"],
        "x-twitter-auth-type": "OAuth2Session",
        "x-twitter-active-user": "yes",
        "x-twitter-client-language": "en",
        "content-type": "application/json",
        "accept": "*/*",
        "user-agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
        ),
        "cookie": "; ".join(f"{k}={v}" for k, v in jar.items()),
        "referer": "https://x.com/",
        "x-twitter-client": "web",
    }


def graphql(op: str, variables: dict) -> dict:
    """Make an authenticated GraphQL GET and return the parsed JSON."""
    if op not in QUERIES:
        sys.exit(f"Unknown op '{op}'. Known: {list(QUERIES)}")
    jar = load_cookies()
    spec = QUERIES[op]
    params = {
        "variables": json.dumps(variables, separators=(",", ":")),
        "features": json.dumps(spec["features"], separators=(",", ":")),
    }
    if spec.get("fieldToggles"):
        params["fieldToggles"] = json.dumps(spec["fieldToggles"], separators=(",", ":"))
    url = f"{BASE}/{spec['qid']}/{op}?{parse.urlencode(params)}"

    req = request.Request(url, headers=_headers(jar), method="GET")
    try:
        with request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        sys.exit(f"HTTP {exc.code}: {body[:500]}")
    except error.URLError as exc:
        sys.exit(f"Network error: {exc.reason}")


def cmd_user(screen_name: str) -> None:
    data = graphql("UserByScreenName", {"screen_name": screen_name, "withGrokTranslatedBio": False})
    try:
        result = data["data"]["user"]["result"]
        legacy = result.get("legacy", {})
        core = result.get("core", {})
        print(f"@{core.get('screen_name') or legacy.get('screen_name') or screen_name}")
        print(f"  name      : {core.get('name') or legacy.get('name')}")
        print(f"  id        : {result.get('rest_id') or result.get('id')}")
        print(f"  followers : {legacy.get('followers_count')}")
        print(f"  following : {legacy.get('friends_count')}")
        print(f"  tweets    : {legacy.get('statuses_count')}")
        print(f"  verified  : {result.get('is_blue_verified')}")
        desc = legacy.get("description")
        if desc:
            print(f"  bio       : {desc[:160]}")
    except (KeyError, TypeError):
        print(json.dumps(data, indent=2, ensure_ascii=False)[:1500])


def cmd_verify() -> None:
    """Confirm the session is authenticated by looking up the logged-in-ish path."""
    jar = load_cookies()
    twid = parse.unquote(jar.get("twid", ""))  # u=<user_id>
    print("Session cookies loaded:", ", ".join(sorted(jar)))
    print("twid (your user id):", twid)
    print("\nTesting an authenticated call (UserByScreenName: x) ...")
    data = graphql("UserByScreenName", {"screen_name": "x", "withGrokTranslatedBio": False})
    ok = "data" in data and data["data"].get("user")
    print("AUTH OK ✅" if ok else "AUTH FAILED ❌")
    if not ok:
        print(json.dumps(data, indent=2)[:800])


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd = args[0]
    if cmd == "user" and len(args) > 1:
        cmd_user(args[1].lstrip("@"))
    elif cmd == "verify":
        cmd_verify()
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
