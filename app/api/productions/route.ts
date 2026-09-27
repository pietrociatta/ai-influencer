import { newId, readDb, updateDb } from "@/lib/db"
import { geminiJson } from "@/lib/gemini"
import { handle } from "@/lib/http"
import { clampDuration, videoModel } from "@/lib/models"
import { directorBrief, directorSystem } from "@/lib/prompts"
import type { Production } from "@/lib/types"

type Plan = { clips: Array<{ beat: string; durationSec: number; framePrompt: string; videoPrompt: string }> }

/** Writes the direction (clips + prompts). With `id`, rewrites an existing production in place. */
export const POST = handle(async (req: Request) => {
  const input = (await req.json()) as {
    id?: string
    influencerId: string
    productId: string
    direction: string
    language: string
    clipCount: string
    imageModel: string
    videoModel: string
  }
  if (!input.direction?.trim()) throw new Error("Scrivi cosa deve fare l'influencer")
  const db = await readDb()
  const influencer = db.influencers.find((i) => i.id === input.influencerId)
  const product = db.products.find((p) => p.id === input.productId)
  if (!influencer) throw new Error("Scegli un influencer (step 1)")
  if (!product) throw new Error("Scegli un prodotto (step 2)")

  const model = videoModel(input.videoModel)
  const plan = await geminiJson<Plan>({
    system: directorSystem(model.promptStyle, model.minSec, model.maxSec),
    parts: [
      {
        text: directorBrief({
          look: influencer.look,
          productName: product.name,
          productDescription: product.description,
          direction: input.direction,
          language: input.language,
          clipCount: input.clipCount,
        }),
      },
    ],
    temperature: 0.7,
  })
  if (!plan.clips?.length) throw new Error("La regia non ha prodotto clip, riprova")

  const production: Production = {
    id: input.id ?? newId("ugc"),
    influencerId: influencer.id,
    productId: product.id,
    direction: input.direction,
    language: input.language,
    imageModel: input.imageModel,
    videoModel: model.id,
    clips: plan.clips.slice(0, 3).map((c) => ({
      id: newId("clip"),
      beat: c.beat,
      durationSec: clampDuration(model, c.durationSec),
      framePrompt: c.framePrompt,
      videoPrompt: c.videoPrompt,
    })),
    createdAt: new Date().toISOString(),
  }
  return updateDb((db) => {
    db.productions = [production, ...db.productions.filter((p) => p.id !== production.id)]
    return production
  })
})
