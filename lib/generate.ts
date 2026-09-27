import { falQueue } from "./fal"
import { saveRemote } from "./media"
import { imageModel, videoModel, type Aspect } from "./models"
import type { Media } from "./types"

function isContentFlag(err: unknown): boolean {
  return /content checker|content_policy|moderation/i.test(err instanceof Error ? err.message : String(err))
}

async function runImage(modelId: string, prompt: string, aspect: Aspect, refs: string[]): Promise<Media> {
  const { endpoint, body } = imageModel(modelId).build({ prompt, aspect, refs })
  const result = await falQueue(endpoint, body, 300_000)
  const url = (result.images as Array<{ url?: string }> | undefined)?.[0]?.url
  if (!url) throw new Error(`${modelId}: nessuna immagine restituita`)
  return saveRemote(url, ".jpg")
}

/** Walks the chain of `fallback` models for as long as a content checker keeps blocking the request. */
export async function generateImage(input: {
  modelId: string
  prompt: string
  aspect: Aspect
  refs?: string[]
}): Promise<{ media: Media; modelId: string; notice?: string }> {
  const refs = input.refs ?? []
  const blocked: string[] = []
  let model = imageModel(input.modelId)

  while (true) {
    try {
      const media = await runImage(model.id, input.prompt, input.aspect, refs)
      const notice = blocked.length
        ? `Moderazione: ${blocked.join(" e ")} ha bloccato l'immagine, generata con ${model.label}.`
        : undefined
      return { media, modelId: model.id, notice }
    } catch (err) {
      const next = model.fallback ? imageModel(model.fallback) : undefined
      if (!next || next.id === model.id || blocked.includes(next.label) || !isContentFlag(err)) throw err
      console.warn(`[img] ${model.label} bloccato dalla moderazione · ripiego su ${next.label}`)
      blocked.push(model.label)
      model = next
    }
  }
}

export async function generateVideo(input: {
  modelId: string
  prompt: string
  frameUrl: string
  durationSec: number
}): Promise<Media> {
  const { endpoint, body } = videoModel(input.modelId).build(input)
  const result = await falQueue(endpoint, body)
  const url = (result.video as { url?: string } | undefined)?.url
  if (!url) throw new Error(`${input.modelId}: nessun video restituito`)
  return saveRemote(url, ".mp4")
}
