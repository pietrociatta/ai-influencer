import type { Media } from "@/lib/types"

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`)
  return data
}

export function send<T>(path: string, body: unknown, method = "POST"): Promise<T> {
  return api<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function mediaSrc(media: Media): string {
  return `/api/media/${media.file}`
}
