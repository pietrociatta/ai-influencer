import { NextResponse } from "next/server"

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      return NextResponse.json(await fn(...args))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[api]", message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}

export type Params<K extends string, V = string> = { params: Promise<Record<K, V>> }
