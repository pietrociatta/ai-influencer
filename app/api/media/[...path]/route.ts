import { createReadStream, existsSync, statSync } from "node:fs"
import { basename, extname } from "node:path"
import { Readable } from "node:stream"
import { MIME, mediaPath } from "@/lib/media"
import type { Params } from "@/lib/http"

export async function GET(req: Request, { params }: Params<"path", string[]>) {
  const { path } = await params
  const file = mediaPath(basename(path.join("/")))
  if (!existsSync(file)) return new Response("not found", { status: 404 })

  const size = statSync(file).size
  const type = MIME[extname(file).toLowerCase()] ?? "application/octet-stream"
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/)
  if (range) {
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Number(range[2]) : size - 1
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      },
    })
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(stream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" },
  })
}
