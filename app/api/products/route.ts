import { extname } from "node:path"
import { newId, updateDb } from "@/lib/db"
import { geminiJson } from "@/lib/gemini"
import { generateImage } from "@/lib/generate"
import { handle } from "@/lib/http"
import { MIME, saveBuffer } from "@/lib/media"
import { DESCRIBE_PRODUCT } from "@/lib/prompts"
import type { Media, Product } from "@/lib/types"

async function fromUpload(form: FormData) {
  const file = form.get("file")
  if (!(file instanceof File)) throw new Error("Nessuna foto caricata")
  const ext = extname(file.name).toLowerCase()
  if (!MIME[ext] || MIME[ext].startsWith("video")) throw new Error("Carica un'immagine jpg, png o webp")
  const data = Buffer.from(await file.arrayBuffer())
  const [image, described] = await Promise.all([
    saveBuffer(data, ext === ".jpeg" ? ".jpg" : ext),
    geminiJson<{ name: string; description: string }>({
      system: DESCRIBE_PRODUCT,
      parts: [{ inlineData: { mimeType: MIME[ext], data: data.toString("base64") } }],
      temperature: 0.2,
    }),
  ])
  const notes = String(form.get("brief") ?? "")
  return {
    name: String(form.get("name") ?? "") || described.name,
    brief: notes,
    description: notes ? `${described.description} ${notes}` : described.description,
    source: "upload" as const,
    image,
  }
}

async function fromPrompt(req: Request) {
  const input = (await req.json()) as { name: string; brief: string; description: string; prompt: string; imageModel: string }
  if (!input.prompt?.trim()) throw new Error("Prompt immagine vuoto: scrivilo tu o premi “Migliora descrizione”")
  const { media: image, notice } = await generateImage({ modelId: input.imageModel, prompt: input.prompt, aspect: "1:1" })
  return { ...input, source: "generated" as const, image, notice }
}

export const POST = handle(async (req: Request) => {
  const isUpload = req.headers.get("content-type")?.includes("multipart/form-data")
  const made: { name: string; brief: string; description: string; prompt?: string; source: Product["source"]; image: Media; notice?: string } =
    isUpload ? await fromUpload(await req.formData()) : await fromPrompt(req)

  const product = await updateDb((db) => {
    const product: Product = {
      id: newId("prd"),
      name: made.name || "Prodotto",
      brief: made.brief,
      description: made.description,
      prompt: made.prompt,
      source: made.source,
      images: [made.image],
      selected: 0,
      createdAt: new Date().toISOString(),
    }
    db.products.unshift(product)
    return product
  })
  return { ...product, notice: made.notice }
})
