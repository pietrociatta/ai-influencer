import type { Tweet, TweetMetrics } from "../types.js"
import { createLogger } from "../logger.js"

const log = createLogger("search")

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

function screenName(result: Json): string | undefined {
  const user = asObj(
    asObj(asObj(result.core)?.user_results)?.result ??
      asObj(result.user),
  )
  const core = asObj(user?.core)
  const legacy = asObj(user?.legacy)
  return asStr(core?.screen_name) ?? asStr(legacy?.screen_name)
}

function userId(result: Json): string | undefined {
  const user = asObj(asObj(asObj(result.core)?.user_results)?.result)
  return asStr(user?.rest_id)
}

function getSearchInstructions(payload: unknown): unknown[] {
  const timeline = asObj(
    asObj(
      asObj(asObj(asObj(payload)?.data)?.search_by_raw_query)?.search_timeline,
    )?.timeline,
  )
  return asArr(timeline?.instructions)
}

export function extractSearchBottomCursor(payload: unknown): string | undefined {
  for (const instRaw of getSearchInstructions(payload)) {
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

export function parseSearchTweets(payload: unknown, fetchedAt: string): Tweet[] {
  const instructions = getSearchInstructions(payload)
  const tweets: Tweet[] = []

  const handleResult = (rawResult: unknown) => {
    const result = unwrapTweetResult(rawResult)
    if (!result) return
    const legacy = asObj(result.legacy)
    if (!legacy) return

    const id = asStr(result.rest_id) ?? asStr(legacy.id_str)
    const username = screenName(result)
    if (!id || !username) return

    const isRetweet = "retweeted_status_result" in legacy
    const isReply = Boolean(asStr(legacy.in_reply_to_status_id_str))
    if (isRetweet || isReply) return

    tweets.push({
      id,
      username: username.toLowerCase(),
      userId: userId(result),
      text: extractText(result, legacy),
      createdAt: toIso(asStr(legacy.created_at)),
      lang: asStr(legacy.lang),
      metrics: extractMetrics(legacy, result),
      fetchedAt,
    })
  }

  for (const instRaw of instructions) {
    const inst = asObj(instRaw)
    if (!inst || asStr(inst.type) !== "TimelineAddEntries") continue
    for (const entryRaw of asArr(inst.entries)) {
      const entry = asObj(entryRaw)
      const entryId = asStr(entry?.entryId) ?? ""
      if (!entryId.startsWith("tweet-")) continue
      const item = asObj(asObj(entry?.content)?.itemContent)
      const result = asObj(asObj(item?.tweet_results)?.result)
      handleResult(result)
    }
  }

  const byId = new Map<string, Tweet>()
  for (const t of tweets) byId.set(t.id, t)
  const deduped = [...byId.values()].sort((a, b) =>
    a.id.length !== b.id.length ? b.id.length - a.id.length : b.id.localeCompare(a.id),
  )
  log.debug(`parsed ${deduped.length} search tweets`)
  return deduped
}
