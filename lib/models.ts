export type Aspect = "9:16" | "3:4" | "1:1"

export type ImageModel = {
  id: string
  label: string
  note: string
  /** model retried automatically when this one's content checker blocks the request */
  fallback?: string
  build: (input: { prompt: string; aspect: Aspect; refs: string[] }) => { endpoint: string; body: Record<string, unknown> }
}

const SIZE_PRESET: Record<Aspect, string> = {
  "9:16": "portrait_16_9",
  "3:4": "portrait_4_3",
  "1:1": "square_hd",
}

/** Phrased positively: the endpoint classifier matches keywords and ignores negations, so "no nudity" reads as "nudity". */
const GPT_CONSTRAINTS =
  "Style: everyday opaque clothing, relaxed candid posture, original invented adult face, the described product as the only branded item, clean frame with plain surfaces."

function gptImage25(variant: "flare" | "sunburst", quality: string): ImageModel["build"] {
  return ({ prompt, aspect, refs }) => ({
    endpoint: `openai/gpt-image-2.5/${variant}/${refs.length ? "edit" : "text-to-image"}`,
    body: {
      prompt: /\bstyle:/i.test(prompt) ? prompt : `${prompt.trim()}\n\n${GPT_CONSTRAINTS}`,
      ...(refs.length ? { image_urls: refs } : {}),
      image_size: SIZE_PRESET[aspect],
      quality,
      num_images: 1,
      output_format: "jpeg",
      moderation: "low",
    },
  })
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gpt-image-2.5",
    label: "GPT Image 2.5",
    note: "Default OpenAI, veloce, luce naturale · se blocca passa a Nano Banana Pro",
    fallback: "nano-banana-pro",
    build: gptImage25("flare", "medium"),
  },
  {
    id: "gpt-image-2.5-sunburst",
    label: "GPT Image 2.5 Sunburst",
    note: "Più dettaglio e fedeltà, più lento · se blocca passa a Nano Banana Pro",
    fallback: "nano-banana-pro",
    build: gptImage25("sunburst", "high"),
  },
  {
    id: "nano-banana-pro",
    label: "Nano Banana Pro",
    note: "Gemini 3 Pro Image, forte sulle reference · se blocca passa a Qwen Edit Plus",
    fallback: "qwen-image-edit-plus",
    build: ({ prompt, aspect, refs }) => ({
      endpoint: refs.length ? "fal-ai/nano-banana-pro/edit" : "fal-ai/nano-banana-pro",
      body: {
        prompt,
        ...(refs.length ? { image_urls: refs } : {}),
        aspect_ratio: aspect,
        resolution: "1K",
        num_images: 1,
        output_format: "jpeg",
        safety_tolerance: "6",
        limit_generations: true,
      },
    }),
  },
  {
    // Open weights on fal's own GPUs: no partner filter, and enable_safety_checker turns off fal's own one.
    id: "qwen-image-edit-plus",
    label: "Qwen Image Edit Plus",
    note: "Ultima spiaggia quando gli altri bloccano: nessun filtro partner",
    build: ({ prompt, aspect, refs }) => ({
      endpoint: refs.length ? "fal-ai/qwen-image-edit-plus" : "fal-ai/qwen-image",
      body: {
        prompt,
        ...(refs.length ? { image_urls: refs } : {}),
        image_size: SIZE_PRESET[aspect],
        num_images: 1,
        output_format: "jpeg",
        acceleration: "regular",
        enable_safety_checker: false,
      },
    }),
  },
]

/** "h3" prompts use the H3 integrated_multimodal_description template; "prose" is the same brief without H3 field labels. */
export type PromptStyle = "h3" | "prose"

export type VideoModel = {
  id: string
  label: string
  note: string
  usdPerSec: number
  minSec: number
  maxSec: number
  promptStyle: PromptStyle
  build: (input: { prompt: string; frameUrl: string; durationSec: number }) => { endpoint: string; body: Record<string, unknown> }
}

function h3(endpoint: string): VideoModel["build"] {
  return ({ prompt, frameUrl, durationSec }) => ({
    endpoint,
    body: {
      prompt,
      image_url: frameUrl,
      duration: durationSec,
      resolution: "768P",
      prompt_expansion_mode: "disabled",
      enable_safety_checker: false,
    },
  })
}

export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "h3-max-turbo",
    label: "MiniMax H3 Turbo · 768p",
    note: "Veloce ed economico, ideale per testare tanti hook",
    usdPerSec: 0.04,
    minSec: 5,
    maxSec: 15,
    promptStyle: "h3",
    build: h3("minimax/h3-max-turbo/image-to-video"),
  },
  {
    id: "h3-max",
    label: "MiniMax H3 Max · 768p",
    note: "Stesso prompt, più qualità per i vincenti",
    usdPerSec: 0.08,
    minSec: 5,
    maxSec: 15,
    promptStyle: "h3",
    build: h3("minimax/h3-max/image-to-video"),
  },
  {
    id: "kling-3",
    label: "Kling 3.0 Pro · audio",
    note: "Look più cinematografico, faccia stabile",
    usdPerSec: 0.168,
    minSec: 3,
    maxSec: 15,
    promptStyle: "prose",
    build: ({ prompt, frameUrl, durationSec }) => ({
      endpoint: "fal-ai/kling-video/v3/pro/image-to-video",
      body: {
        prompt,
        start_image_url: frameUrl,
        duration: String(durationSec),
        generate_audio: true,
        negative_prompt: "on-screen text, captions, UI, plastic skin, studio lighting, extra fingers, mirrored label, blur, distortion",
      },
    }),
  },
  {
    id: "seedance-2.5",
    label: "Seedance 2.5 · 480p",
    note: "Look “iPhone vero”; può rifiutare volti fotorealistici",
    usdPerSec: 0.2205,
    minSec: 4,
    maxSec: 15,
    promptStyle: "prose",
    build: ({ prompt, frameUrl, durationSec }) => ({
      endpoint: "bytedance/seedance-2.5/image-to-video",
      body: {
        prompt,
        image_url: frameUrl,
        duration: String(durationSec),
        resolution: "480p",
        generate_audio: true,
      },
    }),
  },
]

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].id
export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS[0].id

export function imageModel(id: string): ImageModel {
  return IMAGE_MODELS.find((m) => m.id === id) ?? IMAGE_MODELS[0]
}

export function videoModel(id: string): VideoModel {
  return VIDEO_MODELS.find((m) => m.id === id) ?? VIDEO_MODELS[0]
}

export function clampDuration(model: VideoModel, sec: number): number {
  return Math.min(model.maxSec, Math.max(model.minSec, Math.round(sec)))
}
