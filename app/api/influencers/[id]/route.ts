import { updateDb } from "@/lib/db"
import { handle, type Params } from "@/lib/http"

export const PATCH = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params
  const patch = (await req.json()) as { selected?: number; name?: string; look?: string }
  return updateDb((db) => {
    const inf = db.influencers.find((i) => i.id === id)
    if (!inf) throw new Error("Influencer non trovato")
    if (typeof patch.selected === "number") inf.selected = patch.selected
    if (patch.name) inf.name = patch.name
    if (patch.look) inf.look = patch.look
    return inf
  })
})

export const DELETE = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params
  return updateDb((db) => {
    db.influencers = db.influencers.filter((i) => i.id !== id)
    return { ok: true }
  })
})
