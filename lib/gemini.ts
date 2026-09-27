export type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } }

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY mancante in .env")
  return key
}

function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  try {
    return JSON.parse(cleaned) as T
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("Gemini non ha restituito JSON valido")
    return JSON.parse(match[0]) as T
  }
}

export async function geminiJson<T>(input: { system: string; parts: GeminiPart[]; temperature?: number }): Promise<T> {
  const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey())}`
  const body = {
    systemInstruction: { parts: [{ text: input.system }] },
    contents: [{ role: "user", parts: input.parts }],
    generationConfig: { temperature: input.temperature ?? 0.6, responseMimeType: "application/json" },
  }

  let lastErr: Error | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = (await res.json()) as {
      error?: { message?: string }
      candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string }> } }>
    }
    if (res.status === 429 || res.status >= 500) {
      lastErr = new Error(`Gemini ${res.status}`)
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt))
      continue
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${data.error?.message ?? "errore"}`)
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim()
    if (text) return parseJson<T>(text)
    lastErr = new Error(`Gemini risposta vuota (${data.candidates?.[0]?.finishReason ?? "?"})`)
  }
  throw lastErr ?? new Error("Gemini fallito")
}
