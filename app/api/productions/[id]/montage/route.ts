import { readDb, updateDb } from "@/lib/db"
import { handle, type Params } from "@/lib/http"
import { montage } from "@/lib/montage"
import type { Media } from "@/lib/types"

export const POST = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params
  const production = (await readDb()).productions.find((p) => p.id === id)
  if (!production) throw new Error("Produzione non trovata")
  const videos = production.clips.map((c) => c.video)
  if (videos.some((v) => !v)) throw new Error("Genera prima il video di tutte le clip")
  const final = await montage(videos as Media[])
  return updateDb((db) => {
    const p = db.productions.find((x) => x.id === id)
    if (p) p.montage = final
    return p
  })
})
