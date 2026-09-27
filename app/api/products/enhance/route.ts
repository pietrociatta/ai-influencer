import { geminiJson } from "@/lib/gemini"
import { handle } from "@/lib/http"
import { ENHANCE_PRODUCT } from "@/lib/prompts"

export const POST = handle(async (req: Request) => {
  const { brief } = (await req.json()) as { brief: string }
  if (!brief?.trim()) throw new Error("Descrivi il prodotto")
  return geminiJson<{ name: string; description: string; prompt: string }>({
    system: ENHANCE_PRODUCT,
    parts: [{ text: brief }],
  })
})
