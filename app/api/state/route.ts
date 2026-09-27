import { readDb } from "@/lib/db"
import { handle } from "@/lib/http"

export const dynamic = "force-dynamic"

export const GET = handle(async () => readDb())
