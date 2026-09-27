
function falKey(): string {
  const key = process.env.FAL_KEY
  if (!key) throw new Error("FAL_KEY mancante in .env")
  return key
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const raw = await res.text()
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new Error(`fal ${res.status}: ${raw.slice(0, 240)}`)
  }
}

/** `["body", "image_urls", 0]` -> `image_urls.0`: on a content_policy_violation this is the input that got flagged. */
function detailField(loc: unknown): string {
  if (!Array.isArray(loc)) return ""
  return loc.map(String).filter((part) => part !== "body").join(".")
}

function detailText(detail: unknown): string {
  if (typeof detail !== "object" || !detail || !("msg" in detail)) return String(detail)
  const { msg, loc } = detail as { msg: unknown; loc?: unknown }
  const field = detailField(loc)
  return field ? `${String(msg)} [campo: ${field}]` : String(msg)
}

function falError(data: Record<string, unknown>, fallback: string): string {
  if (typeof data.detail === "string") return data.detail
  if (typeof data.error === "string") return data.error
  if (Array.isArray(data.detail)) return data.detail.map(detailText).join("; ")
  return fallback
}

export async function falQueue(endpoint: string, body: Record<string, unknown>, timeoutMs = 900_000) {
  const auth = { Authorization: `Key ${falKey()}` }
  const startedAt = Date.now()
  const elapsed = () => ((Date.now() - startedAt) / 1000).toFixed(1)
  const fail = (message: string): never => {
    console.error(`[fal] ${endpoint} · errore dopo ${elapsed()}s · ${message}`)
    throw new Error(message)
  }

  console.log(`[fal] ${endpoint} · invio`)
  const submit = await fetch(`https://queue.fal.run/${endpoint}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const queued = await readJson(submit)
  if (!submit.ok) fail(falError(queued, `fal ${submit.status}`))
  const statusUrl = String(queued.status_url)
  let responseUrl = String(queued.response_url)

  const deadline = Date.now() + timeoutMs
  while (true) {
    const status = await readJson(await fetch(statusUrl, { headers: auth }))
    if (status.status === "COMPLETED") {
      if (typeof status.response_url === "string") responseUrl = status.response_url
      break
    }
    if (status.status === "FAILED" || status.status === "CANCELLED") {
      const url = typeof status.response_url === "string" ? status.response_url : responseUrl
      const body: Record<string, unknown> = await fetch(url, { headers: auth }).then(readJson).catch(() => ({}))
      fail(falError({ ...status, ...body }, `fal ${status.status}`))
    }
    if (Date.now() > deadline) fail(`fal timeout (${endpoint})`)
    await new Promise((r) => setTimeout(r, 2000))
  }

  const res = await fetch(responseUrl, { headers: auth })
  const result = await readJson(res)
  if (!res.ok) fail(falError(result, `fal result ${res.status}`))
  console.log(`[fal] ${endpoint} · fatto in ${elapsed()}s`)
  return result
}

export async function uploadToFal(data: Buffer, contentType: string, fileName: string): Promise<string> {
  const init = await fetch("https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3", {
    method: "POST",
    headers: { Authorization: `Key ${falKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  })
  const json = (await init.json()) as { upload_url?: string; file_url?: string; detail?: string }
  if (!init.ok || !json.upload_url || !json.file_url) throw new Error(json.detail ?? "fal upload fallito")
  const put = await fetch(json.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(data),
  })
  if (!put.ok) throw new Error("fal upload fallito")
  return json.file_url
}
