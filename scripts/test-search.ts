import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const sessionFile = resolve(import.meta.dirname, "../python/session_cookies.txt")
if (!process.env.X_SESSION_COOKIE && existsSync(sessionFile)) {
  process.env.X_SESSION_COOKIE = readFileSync(sessionFile, "utf8").trim()
}

const query = process.argv[2] ?? "$AEHR"
const { fetchSearchTimeline, parseSearchTweets } = await import("../src/index.js")

const payload = await fetchSearchTimeline(query, { count: 20, product: "Latest" })
const tweets = parseSearchTweets(payload, new Date().toISOString())

console.log(`query=${query} tweets=${tweets.length}`)
for (const t of tweets.slice(0, 5)) {
  console.log(`  ${t.createdAt.slice(0, 10)} @${t.username}: ${t.text.slice(0, 90)}`)
}
