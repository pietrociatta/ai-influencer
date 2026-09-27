import { execFile } from "node:child_process"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { newId } from "./db"
import { mediaPath, saveBuffer } from "./media"
import type { Media } from "./types"

const run = promisify(execFile)

async function probe(path: string): Promise<{ audio: boolean; duration: number }> {
  const { stdout } = await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", path])
  const info = JSON.parse(stdout) as { streams: Array<{ codec_type: string }>; format: { duration: string } }
  return { audio: info.streams.some((s) => s.codec_type === "audio"), duration: Number(info.format.duration) }
}

/** Concatenates clips into one 720x1280 30fps video, adding silence to clips without audio. */
export async function montage(clips: Media[]): Promise<Media> {
  const paths = clips.map((c) => mediaPath(c.file))
  const infos = await Promise.all(paths.map(probe))
  const args = ["-y"]
  paths.forEach((p) => args.push("-i", p))

  const filters: string[] = []
  const pairs: string[] = []
  let extra = paths.length
  infos.forEach((info, i) => {
    filters.push(
      `[${i}:v]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v${i}]`,
    )
    let source = `${i}:a`
    if (!info.audio) {
      args.push("-f", "lavfi", "-t", String(info.duration), "-i", "anullsrc=r=48000:cl=stereo")
      source = `${extra++}:a`
    }
    filters.push(`[${source}]aresample=48000,aformat=channel_layouts=stereo[a${i}]`)
    pairs.push(`[v${i}][a${i}]`)
  })

  const out = join(tmpdir(), `${newId("montage")}.mp4`)
  args.push(
    "-filter_complex", `${filters.join(";")};${pairs.join("")}concat=n=${paths.length}:v=1:a=1[v][a]`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-crf", "20", "-preset", "veryfast", "-c:a", "aac",
    out,
  )
  await run("ffmpeg", args, { maxBuffer: 64 * 1024 * 1024 })
  return saveBuffer(await readFile(out), ".mp4")
}
