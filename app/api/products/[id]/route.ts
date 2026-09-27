import { updateDb } from "@/lib/db"
import { handle, type Params } from "@/lib/http"

export const PATCH = handle(async (req: Request, { params }: Params<"id">) => {
  const { id } = await params
  const patch = (await req.json()) as { name?: string; description?: string }
  return updateDb((db) => {
    const product = db.products.find((p) => p.id === id)
    if (!product) throw new Error("Prodotto non trovato")
    if (patch.name) product.name = patch.name
    if (patch.description) product.description = patch.description
    return product
  })
})

export const DELETE = handle(async (_req: Request, { params }: Params<"id">) => {
  const { id } = await params
  return updateDb((db) => {
    db.products = db.products.filter((p) => p.id !== id)
    return { ok: true }
  })
})
