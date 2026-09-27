import { readDb, updateDb } from "./db"
import { generateImage, generateVideo } from "./generate"
import { remoteUrl } from "./media"
import { clampDuration, videoModel } from "./models"
import type { Clip, Media } from "./types"

async function context(productionId: string, clipId: string) {
  const db = await readDb()
  const production = db.productions.find((p) => p.id === productionId)
  if (!production) throw new Error("Produzione non trovata")
  const clip = production.clips.find((c) => c.id === clipId)
  if (!clip) throw new Error("Clip non trovata")
  const influencer = db.influencers.find((i) => i.id === production.influencerId)
  const product = db.products.find((p) => p.id === production.productId)
  if (!influencer || !product) throw new Error("Influencer o prodotto eliminato")
  return { production, clip, influencer, product }
}

function saveClip(productionId: string, clipId: string, patch: Partial<Clip>): Promise<Clip> {
  return updateDb((db) => {
    const production = db.productions.find((p) => p.id === productionId)
    const clip = production?.clips.find((c) => c.id === clipId)
    if (!production || !clip) throw new Error("Clip non trovata")
    Object.assign(clip, patch)
    if ("video" in patch) production.montage = undefined
    return clip
  })
}

async function withError<T>(productionId: string, clipId: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    await saveClip(productionId, clipId, { error: err instanceof Error ? err.message : String(err) })
    throw err
  }
}

export function generateFrame(productionId: string, clipId: string): Promise<Clip & { notice?: string }> {
  return withError(productionId, clipId, async () => {
    const { production, clip, influencer, product } = await context(productionId, clipId)
    const refs = await Promise.all([
      remoteUrl(influencer.images[influencer.selected]),
      remoteUrl(product.images[product.selected]),
    ])
    const { media: frame, modelId: frameModel, notice } = await generateImage({ modelId: production.imageModel, prompt: clip.framePrompt, aspect: "9:16", refs })
    return { ...(await saveClip(productionId, clipId, { frame, frameModel, video: undefined, error: undefined })), notice }
  })
}

export function generateClipVideo(productionId: string, clipId: string): Promise<Clip & { notice?: string }> {
  return withError(productionId, clipId, async () => {
    let { production, clip } = await context(productionId, clipId)
    let notice: string | undefined
    if (!clip.frame) ({ notice, ...clip } = await generateFrame(productionId, clipId))
    const model = videoModel(production.videoModel)
    const video = await generateVideo({
      modelId: model.id,
      prompt: clip.videoPrompt,
      frameUrl: await remoteUrl(clip.frame as Media),
      durationSec: clampDuration(model, clip.durationSec),
    })
    return { ...(await saveClip(productionId, clipId, { video, videoModel: model.id, error: undefined })), notice }
  })
}
