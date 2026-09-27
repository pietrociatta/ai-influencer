import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { extname, join } from "node:path"
import { DATA_DIR, newId } from "./db"
import { uploadToFal } from "./fal"
import type { Media } from "./types"

export const MEDIA_DIR = join(DATA_DIR, "media")

export const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
}

export function mediaPath(file: string): string {
  return join(MEDIA_DIR, file)
}

export async function saveBuffer(data: Buffer, ext: string, url?: string): Promise<Media> {
  await mkdir(MEDIA_DIR, { recursive: true })
  const file = `${newId("m")}${ext}`
  await writeFile(mediaPath(file), data)
  const contentType = MIME[ext] ?? "application/octet-stream"
  return { file, url: url ?? (await uploadToFal(data, contentType, file)) }
}

export async function saveRemote(url: string, fallbackExt: string): Promise<Media> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download fallito (${res.status})`)
  const ext = extname(new URL(url).pathname).toLowerCase() || fallbackExt
  return saveBuffer(Buffer.from(await res.arrayBuffer()), MIME[ext] ? ext : fallbackExt, url)
}

/** fal CDN links can expire; re-upload the local copy when the remote one is gone. */
export async function remoteUrl(media: Media): Promise<string> {
  const head = await fetch(media.url, { method: "HEAD" }).catch(() => null)
  if (head?.ok) return media.url
  const path = mediaPath(media.file)
  if (!existsSync(path)) throw new Error(`media mancante: ${media.file}`)
  const ext = extname(media.file).toLowerCase()
  media.url = await uploadToFal(await readFile(path), MIME[ext] ?? "application/octet-stream", media.file)
  return media.url
}
