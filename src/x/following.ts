export type FollowingUser = {
  username: string
  userId: string
  friendsCount?: number
  followersCount?: number
}

type TimelineEntry = {
  entryId?: string
  content?: {
    entryType?: string
    itemContent?: {
      itemType?: string
      user_results?: {
        result?: {
          __typename?: string
          rest_id?: string
          legacy?: {
            screen_name?: string
            friends_count?: number
            followers_count?: number
          }
          core?: { screen_name?: string }
        }
      }
    }
    value?: string
    cursorType?: string
  }
}

function walkEntries(node: unknown, out: TimelineEntry[]): void {
  if (!node || typeof node !== "object") return
  if (Array.isArray(node)) {
    for (const child of node) walkEntries(child, out)
    return
  }
  const obj = node as Record<string, unknown>
  if (typeof obj.entryId === "string" && obj.content) {
    out.push(obj as TimelineEntry)
  }
  for (const value of Object.values(obj)) walkEntries(value, out)
}

function userFromEntry(entry: TimelineEntry): FollowingUser | null {
  const result = entry.content?.itemContent?.user_results?.result
  if (!result?.rest_id) return null
  const username = (
    result.legacy?.screen_name ??
    result.core?.screen_name ??
    ""
  )
    .trim()
    .toLowerCase()
  if (!username) return null
  return {
    username,
    userId: result.rest_id,
    friendsCount: result.legacy?.friends_count,
    followersCount: result.legacy?.followers_count,
  }
}

export function parseFollowingPage(payload: unknown): {
  users: FollowingUser[]
  bottomCursor?: string
} {
  const entries: TimelineEntry[] = []
  walkEntries(payload, entries)

  const users: FollowingUser[] = []
  const seen = new Set<string>()
  let bottomCursor: string | undefined

  for (const entry of entries) {
    const id = entry.entryId ?? ""
    const content = entry.content
    if (
      content?.cursorType === "Bottom" ||
      id.startsWith("cursor-bottom")
    ) {
      if (typeof content?.value === "string") bottomCursor = content.value
      continue
    }
    const user = userFromEntry(entry)
    if (!user || seen.has(user.username)) continue
    seen.add(user.username)
    users.push(user)
  }

  return { users, bottomCursor }
}
