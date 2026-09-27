import { updateDb } from "@/lib/db"
import { handle, type Params } from "@/lib/http"
import type { Clip } from "@/lib/types"

type ClipEdit = Pick<Clip, "id"> & Partial<Pick<Clip, "beat" | "durationSec" | "framePrompt" | "videoPrompt">>

export const PATCH = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params
  const patch = (await req.json()) as { imageModel?: string; videoModel?: string; clips?: ClipEdit[] }
  return updateDb((db) => {
    const production = db.productions.find((p) => p.id === id)
    if (!production) throw new Error("Produzione non trovata")
    if (patch.imageModel) production.imageModel = patch.imageModel
    if (patch.videoModel) production.videoModel = patch.videoModel
    for (const edit of patch.clips ?? []) {
      const clip = production.clips.find((c) => c.id === edit.id)
      if (!clip) continue
      if (edit.framePrompt !== undefined && edit.framePrompt !== clip.framePrompt) clip.frame = undefined
      Object.assign(clip, edit)
    }
    return production
  })
})

export const DELETE = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params
  return updateDb((db) => {
    db.productions = db.productions.filter((p) => p.id !== id)
    return { ok: true }
  })
})
