import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const sessionFile = resolve(import.meta.dirname, "../python/session_cookies.txt")
if (!process.env.X_SESSION_COOKIE && existsSync(sessionFile)) {
  process.env.X_SESSION_COOKIE = readFileSync(sessionFile, "utf8").trim()
}

const screenName = process.argv[2]?.replace(/^@/, "")
if (!screenName) {
  console.error("Usage: npm run user -- <screen_name>")
  process.exit(1)
}

const { resolveUserProfile } = await import("../src/index.js")

const profile = await resolveUserProfile(screenName)
if (!profile) {
  console.error(`User @${screenName} not found`)
  process.exit(1)
}

console.log(`@${profile.username}`)
console.log(`  id        : ${profile.userId}`)
console.log(`  followers : ${profile.followersCount}`)
console.log(`  following : ${profile.friendsCount}`)
