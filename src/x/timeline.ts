import type { Tweet, TweetMetrics } from "../types.js"
import { createLogger } from "../logger.js"

const log = createLogger("timeline")

type Json = Record<string, unknown>

function asObj(v: unknown): Json | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : undefined
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}
function asStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
function asNum(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}

function getInstructions(payload: unknown): unknown[] {
  const result = asObj(asObj(asObj(payload)?.data)?.user)?.result
  const timeline = asObj(asObj(result)?.timeline)?.timeline
  return asArr(asObj(timeline)?.instructions)
}

function unwrapTweetResult(result: unknown): Json | undefined {
  const obj = asObj(result)
  if (!obj) return undefined
  if (obj.__typename === "TweetWithVisibilityResults") {
    return asObj(obj.tweet)
  }
  return obj
}

function extractText(result: Json, legacy: Json): string {
  const noteResult = asObj(
    asObj(asObj(result.note_tweet)?.note_tweet_results)?.result,
  )
  const noteText = asStr(noteResult?.text)
  return noteText ?? asStr(legacy.full_text) ?? ""
}

function extractMetrics(legacy: Json, result: Json): TweetMetrics {
  const viewsStr = asStr(asObj(result.views)?.count)
  const views = viewsStr ? Number(viewsStr) : NaN
  return {
    likes: asNum(legacy.favorite_count) ?? 0,
    retweets: asNum(legacy.retweet_count) ?? 0,
    replies: asNum(legacy.reply_count) ?? 0,
    quotes: asNum(legacy.quote_count),
    views: Number.isFinite(views) ? views : undefined,
  }
}

function toIso(createdAt: string | undefined): string {
  if (!createdAt) return new Date().toISOString()
  const d = new Date(createdAt)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function isOriginal(legacy: Json): boolean {
  const isRetweet = "retweeted_status_result" in legacy
  const isQuote = legacy.is_quote_status === true
  const isReply = Boolean(asStr(legacy.in_reply_to_status_id_str))
  return !isRetweet && !isQuote && !isReply
}

export function parseOriginalTweets(
  payload: unknown,
  username: string,
  userId: string | undefined,
  fetchedAt: string,
): Tweet[] {
  const instructions = getInstructions(payload)
  const tweets: Tweet[] = []

  const handleResult = (rawResult: unknown) => {
    const result = unwrapTweetResult(rawResult)
    if (!result) return
    const legacy = asObj(result.legacy)
    if (!legacy) return

    const id = asStr(result.rest_id) ?? asStr(legacy.id_str)
    if (!id) return
    if (!isOriginal(legacy)) return

    tweets.push({
      id,
      username,
      userId,
      text: extractText(result, legacy),
      createdAt: toIso(asStr(legacy.created_at)),
      lang: asStr(legacy.lang),
      metrics: extractMetrics(legacy, result),
      fetchedAt,
    })
  }

  for (const instRaw of instructions) {
    const inst = asObj(instRaw)
    if (!inst) continue
    const type = asStr(inst.type)
    if (type !== "TimelineAddEntries") continue

    for (const entryRaw of asArr(inst.entries)) {
      const entry = asObj(entryRaw)
      const entryId = asStr(entry?.entryId) ?? ""
      if (!entryId.startsWith("tweet-")) continue
      const result = asObj(
        asObj(asObj(asObj(entry?.content)?.itemContent)?.tweet_results),
      )?.result
      handleResult(result)
    }
  }

  const byId = new Map<string, Tweet>()
  for (const t of tweets) byId.set(t.id, t)
  const deduped = [...byId.values()].sort((a, b) =>
    a.id.length !== b.id.length ? b.id.length - a.id.length : b.id.localeCompare(a.id),
  )

  log.debug(`parsed ${deduped.length} original tweets for @${username}`)
  return deduped
}

export function extractBottomCursor(payload: unknown): string | undefined {
  const instructions = getInstructions(payload)
  for (const instRaw of instructions) {
    const inst = asObj(instRaw)
    if (!inst || asStr(inst.type) !== "TimelineAddEntries") continue
    for (const entryRaw of asArr(inst.entries)) {
      const entry = asObj(entryRaw)
      const entryId = asStr(entry?.entryId) ?? ""
      if (!entryId.startsWith("cursor-bottom-")) continue
      const content = asObj(entry?.content)
      if (asStr(content?.cursorType) !== "Bottom") continue
      const value = asStr(content?.value)
      if (value) return value
    }
  }
  return undefined
}
