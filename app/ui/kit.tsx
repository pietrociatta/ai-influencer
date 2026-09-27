"use client"

import { createContext, useContext, useEffect, useState } from "react"

export type Report = (message: string, kind?: "error" | "info") => void

export const ReportContext = createContext<Report>(() => {})

export function Action(props: {
  label: string
  busyLabel?: string
  run: () => Promise<unknown>
  disabled?: boolean
  variant?: "primary" | "ghost" | "danger"
  title?: string
}) {
  const report = useContext(ReportContext)
  const [busy, setBusy] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!busy) return
    const start = Date.now()
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 500)
    return () => clearInterval(timer)
  }, [busy])

  return (
    <button
      type="button"
      className={`btn ${props.variant ?? "primary"}`}
      disabled={busy || props.disabled}
      title={props.title}
      onClick={async () => {
        setBusy(true)
        setElapsed(0)
        try {
          await props.run()
        } catch (err) {
          report(err instanceof Error ? err.message : String(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy && <span className="spinner" />}
      {busy ? `${props.busyLabel ?? props.label} ${elapsed}s` : props.label}
    </button>
  )
}

export function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">
        {props.label}
        {props.hint && <em>{props.hint}</em>}
      </span>
      {props.children}
    </label>
  )
}

export function ModelSelect(props: {
  models: Array<{ id: string; label: string; note: string }>
  value: string
  onChange: (id: string) => void
}) {
  const current = props.models.find((m) => m.id === props.value)
  return (
    <div className="model-select">
      <select value={props.value} onChange={(e) => props.onChange(e.target.value)}>
        {props.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {current && <small>{current.note}</small>}
    </div>
  )
}

export function useStoredState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    const raw = localStorage.getItem(key)
    if (raw !== null) setValue(JSON.parse(raw) as T)
  }, [key])
  return [
    value,
    (v: T) => {
      setValue(v)
      localStorage.setItem(key, JSON.stringify(v))
    },
  ]
}
