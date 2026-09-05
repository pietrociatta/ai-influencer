import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

const sessionFile = resolve(import.meta.dirname, "../python/session_cookies.txt")
if (!process.env.X_SESSION_COOKIE && existsSync(sessionFile)) {
  process.env.X_SESSION_COOKIE = readFileSync(sessionFile, "utf8").trim()
}

const { verifySession } = await import("../src/index.js")

const ok = await verifySession()
console.log(ok ? "AUTH OK ✅" : "AUTH FAILED ❌")
process.exit(ok ? 0 : 1)
