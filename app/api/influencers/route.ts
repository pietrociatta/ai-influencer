import { newId, updateDb } from "@/lib/db"
import { generateImage } from "@/lib/generate"
import { handle } from "@/lib/http"
import type { Influencer } from "@/lib/types"

/** Generates a portrait: creates a new influencer, or adds a variant when `id` is given. */
export const POST = handle(async (req: Request) => {
  const input = (await req.json()) as {
    id?: string
    name: string
    brief: string
    look: string
    prompt: string
    imageModel: string
  }
  if (!input.prompt?.trim()) throw new Error("Prompt immagine vuoto: scrivilo tu o premi “Migliora descrizione”")
  const { media: image, notice } = await generateImage({ modelId: input.imageModel, prompt: input.prompt, aspect: "3:4" })

  const influencer = await updateDb((db) => {
    const existing = input.id && db.influencers.find((i) => i.id === input.id)
    if (existing) {
      Object.assign(existing, {
        name: input.name || existing.name,
        brief: input.brief,
        look: input.look,
        prompt: input.prompt,
        imageModel: input.imageModel,
      })
      existing.images.push(image)
      existing.selected = existing.images.length - 1
      return existing
    }
    const influencer: Influencer = {
      id: newId("inf"),
      name: input.name || "Influencer",
      brief: input.brief,
      look: input.look,
      prompt: input.prompt,
      imageModel: input.imageModel,
      images: [image],
      selected: 0,
      createdAt: new Date().toISOString(),
    }
    db.influencers.unshift(influencer)
    return influencer
  })
  return { ...influencer, notice }
})
