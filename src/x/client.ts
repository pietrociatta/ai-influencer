import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager"
import { config } from "../config.js"
import { createLogger } from "../logger.js"
import {
  invalidateTransactionCache,
  transactionIdFor,
} from "./transaction-id.js"

const log = createLogger("x-client")

// ---------------------------------------------------------------------------
// Authenticated X (Twitter) web-API client — TS port of python/x_client.py.
//
// X's web app does NOT use OAuth access/refresh tokens. It authenticates with:
//   - the auth_token cookie   (durable login; stays valid until it expires)
//   - the ct0 cookie          (CSRF; also sent as the x-csrf-token header)
//   - a PUBLIC bearer token   (hardcoded in x.com's JS — same for every user)
//
// Cookies come from X_SESSION_COOKIE (local) or X_SESSION_SECRET_ARN (cloud).
// ---------------------------------------------------------------------------

const BEARER =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D" +
  "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"

const BASE = "https://x.com/i/api/graphql"

type QuerySpec = {
  qid: string
  features: Record<string, boolean>
  fieldToggles?: Record<string, boolean>
}

const QUERIES: Record<string, QuerySpec> = {
  UserByScreenName: {
    qid: "2qvSHpkWTMS9i0zJAwDNiA",
    features: {
      hidden_profile_subscriptions_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
      subscriptions_verification_info_is_identity_verified_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      highlights_tweets_tab_ui_enabled: true,
      responsive_web_twitter_article_notes_tab_enabled: true,
      subscriptions_feature_can_gift_premium: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    },
    fieldToggles: { withPayments: false, withAuxiliaryUserLabels: true },
  },
  UserTweets: {
    qid: "6r5OLCC_wFH4CpRyXKuAmQ",
    features: {
      rweb_video_screen_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: true,
      responsive_web_jetfuel_frame: false,
      responsive_web_grok_share_attachment_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
    },
    fieldToggles: { withArticlePlainText: false },
  },
  SearchTimeline: {
    qid: "hz_94eVAtrtQo_vO3my7Rw",
    features: {
      rweb_video_screen_enabled: false,
      rweb_cashtags_enabled: true,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
      rweb_tipjar_consumption_enabled: false,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: true,
      rweb_cashtags_composer_attachment_enabled: true,
      responsive_web_jetfuel_frame: true,
      responsive_web_grok_share_attachment_enabled: true,
      responsive_web_grok_annotations_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      rweb_conversational_replies_downvote_enabled: false,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      content_disclosure_indicator_enabled: true,
      content_disclosure_ai_generated_indicator_enabled: true,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: true,
      post_ctas_fetch_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: false,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_grok_imagine_annotation_enabled: true,
      responsive_web_grok_community_note_auto_translation_is_enabled: false,
      responsive_web_enhance_cards_enabled: false,
    },
  },
  Following: {
    qid: process.env.X_QID_FOLLOWING ?? "UCFedrkjMz7PeEAWCWhqFw",
    features: {
      rweb_tipjar_consumption_enabled: true,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      rweb_video_timestamps_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_enhance_cards_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: true,
      responsive_web_profile_redirect_enabled: false,
    },
  },
}

const secrets = new SecretsManagerClient({ region: config.aws.region })

let cachedCookieString: string | null = null

async function loadCookieString(): Promise<string> {
  if (cachedCookieString) return cachedCookieString

  let raw = config.x.sessionCookie
  if (!raw && config.x.sessionSecretArn) {
    const res = await secrets.send(
      new GetSecretValueCommand({ SecretId: config.x.sessionSecretArn }),
    )
    raw = res.SecretString ?? ""
  }
  if (!raw) {
    throw new Error(
      "No X session cookies available (set X_SESSION_COOKIE or X_SESSION_SECRET_ARN).",
    )
  }
  cachedCookieString = raw.trim()
  return cachedCookieString
}

export function resetCookieCache(): void {
  cachedCookieString = null
}

export async function updateSessionCookie(raw: string): Promise<void> {
  const trimmed = raw.trim()
  parseCookies(trimmed)

  if (config.x.sessionSecretArn) {
    await secrets.send(
      new PutSecretValueCommand({
        SecretId: config.x.sessionSecretArn,
        SecretString: trimmed,
      }),
    )
  }
  cachedCookieString = trimmed
  log.info("X session cookie updated")
}

function parseCookies(text: string): Record<string, string> {
  let body = text.trim()
  if (body.toLowerCase().startsWith("cookie:")) {
    body = body.slice(body.indexOf(":") + 1).trim()
  }
  const jar: Record<string, string> = {}
  for (const part of body.replace(/\n/g, ";").split(";")) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf("=")
    if (eq > 0) {
      jar[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  }
  if (!jar.auth_token || !jar.ct0) {
    throw new Error("X session cookies are missing auth_token and/or ct0.")
  }
  return jar
}

function buildHeaders(jar: Record<string, string>): Record<string, string> {
  return {
    authorization: BEARER,
    "x-csrf-token": jar.ct0,
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-active-user": "yes",
    "x-twitter-client-language": "en",
    "content-type": "application/json",
    accept: "*/*",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    cookie: Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; "),
    referer: "https://x.com/",
    "x-twitter-client": "web",
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class XRateLimitError extends Error {
  readonly status = 429
  readonly op: string
  readonly retryAfterMs: number

  constructor(op: string, retryAfterMs: number, body: string) {
    super(`X ${op} HTTP 429: Rate limit exceeded`)
    this.name = "XRateLimitError"
    this.op = op
    this.retryAfterMs = retryAfterMs
    this.cause = body.slice(0, 200)
  }
}

function rateLimitWaitMs(res: Response): number {
  const retryAfter = res.headers.get("retry-after")
  if (retryAfter) {
    const sec = Number(retryAfter)
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(Math.max(sec * 1000, 5_000), 15 * 60_000)
    }
  }
  const reset = res.headers.get("x-rate-limit-reset")
  if (reset) {
    const resetSec = Number(reset)
    if (Number.isFinite(resetSec)) {
      const ms = resetSec * 1000 - Date.now()
      if (ms > 0) return Math.min(Math.max(ms + 1_000, 5_000), 15 * 60_000)
    }
  }
  return 90_000
}

export async function graphql(
  op: keyof typeof QUERIES,
  variables: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
  retryOn404 = true,
  rateLimitAttempts = 0,
): Promise<unknown> {
  const spec = QUERIES[op]
  if (!spec) throw new Error(`Unknown op '${op}'. Known: ${Object.keys(QUERIES)}`)

  const jar = parseCookies(await loadCookieString())
  const params = new URLSearchParams()
  params.set("variables", JSON.stringify(variables))
  params.set("features", JSON.stringify(spec.features))
  if (spec.fieldToggles) {
    params.set("fieldToggles", JSON.stringify(spec.fieldToggles))
  }
  const apiPath = `/i/api/graphql/${spec.qid}/${op}`
  const url = `${BASE}/${spec.qid}/${op}?${params.toString()}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const tid = await transactionIdFor("GET", apiPath)
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...buildHeaders(jar),
        "x-client-transaction-id": tid,
        ...extraHeaders,
      },
      signal: controller.signal,
    })
    const text = await res.text()
    if (res.status === 404 && retryOn404) {
      invalidateTransactionCache()
      return graphql(op, variables, extraHeaders, false, rateLimitAttempts)
    }
    if (res.status === 429) {
      const waitMs = rateLimitWaitMs(res)
      if (rateLimitAttempts < 3) {
        log.warn(
          `X ${op} rate-limited — sleeping ${Math.round(waitMs / 1000)}s ` +
            `(attempt ${rateLimitAttempts + 1}/3)`,
        )
        await sleep(waitMs)
        return graphql(
          op,
          variables,
          extraHeaders,
          retryOn404,
          rateLimitAttempts + 1,
        )
      }
      throw new XRateLimitError(op, waitMs, text)
    }
    if (!res.ok) {
      throw new Error(`X ${op} HTTP ${res.status}: ${text.slice(0, 400)}`)
    }
    return JSON.parse(text)
  } finally {
    clearTimeout(timer)
  }
}

export function isRateLimitError(err: unknown): boolean {
  return (
    err instanceof XRateLimitError ||
    (err instanceof Error && /HTTP 429|rate.?limit/i.test(err.message))
  )
}

export type XUserProfile = {
  userId: string
  username: string
  friendsCount: number
  followersCount: number
}

export async function resolveUserProfile(
  screenName: string,
): Promise<XUserProfile | null> {
  const data = (await graphql("UserByScreenName", {
    screen_name: screenName,
    withGrokTranslatedBio: false,
  })) as {
    data?: {
      user?: {
        result?: {
          rest_id?: string
          legacy?: {
            screen_name?: string
            friends_count?: number
            followers_count?: number
          }
        }
      }
    }
  }
  const result = data?.data?.user?.result
  const restId = result?.rest_id ?? null
  if (!restId) {
    log.warn(`no rest_id for @${screenName}`)
    return null
  }
  return {
    userId: restId,
    username: (result?.legacy?.screen_name ?? screenName).toLowerCase(),
    friendsCount: result?.legacy?.friends_count ?? 0,
    followersCount: result?.legacy?.followers_count ?? 0,
  }
}

export async function resolveUserId(screenName: string): Promise<string | null> {
  const profile = await resolveUserProfile(screenName)
  return profile?.userId ?? null
}

export async function fetchFollowingPage(
  userId: string,
  count = 50,
  cursor?: string,
): Promise<unknown> {
  const variables: Record<string, unknown> = {
    userId,
    count,
    includePromotedContent: false,
  }
  if (cursor) variables.cursor = cursor
  return graphql("Following", variables, {
    referer: `https://x.com/i/user/${userId}/following`,
  })
}

export async function fetchUserTweets(
  userId: string,
  count: number,
  cursor?: string,
): Promise<unknown> {
  const variables: Record<string, unknown> = {
    userId,
    count,
    includePromotedContent: false,
    withQuickPromoteEligibilityTweetFields: false,
    withVoice: true,
  }
  if (cursor) variables.cursor = cursor
  return graphql("UserTweets", variables)
}

export type SearchProduct = "Latest" | "Top" | "People"

export async function fetchSearchTimeline(
  rawQuery: string,
  options?: {
    count?: number
    product?: SearchProduct
    cursor?: string
  },
): Promise<unknown> {
  const variables: Record<string, unknown> = {
    rawQuery,
    count: options?.count ?? 20,
    querySource: "typed_query",
    product: options?.product ?? "Latest",
    withGrokTranslatedBio: false,
    withQuickPromoteEligibilityTweetFields: false,
  }
  if (options?.cursor) variables.cursor = options.cursor
  const referer = `https://x.com/search?q=${encodeURIComponent(rawQuery)}&src=typed_query&f=live`
  return graphql("SearchTimeline", variables, { referer })
}

export async function verifySession(): Promise<boolean> {
  try {
    const id = await resolveUserId("x")
    return Boolean(id)
  } catch (err) {
    log.error("session verify failed", err instanceof Error ? err.message : err)
    return false
  }
}
