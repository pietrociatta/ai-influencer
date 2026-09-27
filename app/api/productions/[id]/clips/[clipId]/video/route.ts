import { handle, type Params } from "@/lib/http"
import { generateClipVideo } from "@/lib/production"

export const POST = handle(async (_req: Request, { params }: Params<"id" | "clipId">) => {
  const { id, clipId } = await params
  return generateClipVideo(id, clipId)
})
