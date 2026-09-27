import { geminiJson } from "@/lib/gemini"
import { handle } from "@/lib/http"
import { ENHANCE_INFLUENCER } from "@/lib/prompts"

export const POST = handle(async (req: Request) => {
  const { brief } = (await req.json()) as { brief: string }
  if (!brief?.trim()) throw new Error("Scrivi una descrizione dell'influencer")
  return geminiJson<{ name: string; look: string; prompt: string }>({
    system: ENHANCE_INFLUENCER,
    parts: [{ text: brief }],
  })
})
