# ai-influencer — X (Twitter) reverse engineering toolkit

Standalone library extracted from [FinTwit](https://github.com/pietrociatta/FinTwit) with everything needed to call X's **authenticated web GraphQL API** using a browser session — no official API keys required.

## What's inside

| Path | Purpose |
| --- | --- |
| `python/` | Session capture, HAR parsing, minimal CLI client |
| `src/x/` | TypeScript client + timeline/search/following parsers |
| `scripts/` | Quick CLI wrappers (`verify`, `user`, `search`) |

### How X web auth works

X's web app does **not** use OAuth access tokens. It authenticates with:

- `auth_token` cookie — your durable login (HttpOnly; copy from DevTools)
- `ct0` cookie — CSRF token (also sent as `x-csrf-token` header)
- A **public** bearer token hardcoded in x.com's JavaScript (same for all users)

GraphQL query IDs and feature flags rotate over time. Capture a fresh HAR from your browser and refresh them when calls start 404ing.

## Setup session (one-time)

1. Log into x.com in Chrome.
2. Export a HAR while browsing (Network tab → right-click → Save all as HAR).
3. Paste the DevTools **Cookies** table (tab-separated) into `python/cookies_table.tsv`.
4. Run:

```bash
python3 python/consolidate_session.py
```

This writes `python/session_cookies.txt` — a ready-to-use Cookie header string.

Verify:

```bash
python3 python/x_client.py verify
# AUTH OK ✅
```

### Refresh query IDs from HAR

```bash
python3 python/parse_har.py ~/Downloads/x.com.har
python3 python/summarize.py
# Check python/logs/endpoints.json for GraphQL operation → query id mapping
```

Update the `qid` values in `src/x/client.ts` (or `python/x_client.py` for the Python client).

## TypeScript client

```bash
npm install
cp .env.example .env
# Or rely on python/session_cookies.txt (scripts auto-load it)
npm run verify
npm run user -- elonmusk
npm run search -- '$TSLA'
```

### Use as a library

```ts
import {
  verifySession,
  resolveUserProfile,
  fetchUserTweets,
  parseOriginalTweets,
  fetchSearchTimeline,
  parseSearchTweets,
} from "./src/index.js"

const ok = await verifySession()
const profile = await resolveUserProfile("somehandle")
const raw = await fetchUserTweets(profile!.userId, 40)
const tweets = parseOriginalTweets(raw, profile!.username, profile!.userId, new Date().toISOString())
```

### Environment variables

| Variable | Description |
| --- | --- |
| `X_SESSION_COOKIE` | Full cookie string (`auth_token=…; ct0=…; …`) |
| `X_SESSION_SECRET_ARN` | Optional AWS Secrets Manager ARN (cloud) |
| `X_QID_FOLLOWING` | Override Following GraphQL query id if it 404s |
| `DEBUG` | Enable debug logs |

## Python CLI

```bash
python3 python/x_client.py verify
python3 python/x_client.py user paradislabs
```

## Security

**Never commit** `session_cookies.txt`, `cookies_table.tsv`, or `.env`. They contain your live X session. All sensitive paths are git-ignored.

## Origin

Extracted from FinTwit's `xlogs/` (Python) and `apps/scraper/src/x/` (TypeScript). FinTwit-specific ingestion, DynamoDB, and scraper control were left behind — this repo is only the reusable X client layer.
