"use client"

import { useContext, useEffect, useMemo, useState } from "react"
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@/lib/models"
import type { Db, Product } from "@/lib/types"
import { api, mediaSrc, send } from "./api"
import { Action, Field, ModelSelect, ReportContext } from "./kit"

type Draft = { name: string; brief: string; description: string; prompt: string; imageModel: string }

const emptyDraft: Draft = { name: "", brief: "", description: "", prompt: "", imageModel: DEFAULT_IMAGE_MODEL }

export function ProductStep(props: {
  db: Db
  refresh: () => Promise<void>
  selectedId: string
  onSelect: (id: string) => void
  onNext: () => void
}) {
  const report = useContext(ReportContext)
  const selected = props.db.products.find((p) => p.id === props.selectedId)
  const [mode, setMode] = useState<"upload" | "generate">("upload")
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [description, setDescription] = useState("")
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file])

  useEffect(() => setDescription(selected?.description ?? ""), [selected?.id, selected?.description])

  const created = async (product: Product & { notice?: string }) => {
    if (product.notice) report(product.notice, "info")
    await props.refresh()
    props.onSelect(product.id)
  }

  const upload = async () => {
    if (!file) throw new Error("Scegli una foto")
    const form = new FormData()
    form.set("file", file)
    form.set("name", draft.name)
    form.set("brief", draft.brief)
    await created(await api<Product>("/api/products", { method: "POST", body: form }))
    setFile(null)
    setDraft(emptyDraft)
  }

  const enhance = async () => {
    const res = await send<{ name: string; description: string; prompt: string }>("/api/products/enhance", { brief: draft.brief })
    const next = { ...draft, name: draft.name || res.name, description: res.description, prompt: res.prompt }
    setDraft(next)
    return next
  }

  const generate = async () => {
    const ready = draft.prompt.trim() ? draft : await enhance()
    await created(await send<Product>("/api/products", ready))
  }

  return (
    <section className="step-page">
      <header className="step-head">
        <div>
          <h1>2 · Il prodotto</h1>
          <p>
            Carica la foto del prodotto vero oppure descrivilo (o incolla un prompt immagine) e lo genero come packshot. Ne ricavo una
            descrizione fissa per non fargli cambiare etichetta nei video.
          </p>
        </div>
        <button className="btn ghost" disabled={!selected} onClick={props.onNext}>
          Avanti: regia →
        </button>
      </header>

      <div className="split">
        <div className="panel">
          <div className="tabs">
            <button className={mode === "upload" ? "on" : ""} onClick={() => setMode("upload")}>
              Carica foto
            </button>
            <button className={mode === "generate" ? "on" : ""} onClick={() => setMode("generate")}>
              Genera con AI
            </button>
          </div>

          <Field label="Nome" hint="facoltativo">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Siero LUMEA Vitamina C" />
          </Field>

          {mode === "upload" ? (
            <>
              <Field label="Foto prodotto" hint="jpg, png, webp · meglio packshot frontale">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>
              {preview && <img className="preview" src={preview} alt="" />}
              <Field label="Note" hint="facoltative, es. formato, cosa evidenziare">
                <textarea rows={2} value={draft.brief} onChange={(e) => set({ brief: e.target.value })} />
              </Field>
              <div className="row">
                <Action label="Carica prodotto" busyLabel="Carico e analizzo" run={upload} disabled={!file} />
              </div>
            </>
          ) : (
            <>
              <Field label="Descrizione breve">
                <textarea
                  rows={3}
                  value={draft.brief}
                  onChange={(e) => set({ brief: e.target.value })}
                  placeholder="Flacone ambrato con contagocce, siero vitamina C, etichetta bianca minimal"
                />
              </Field>
              <Field label="Modello immagine">
                <ModelSelect models={IMAGE_MODELS} value={draft.imageModel} onChange={(imageModel) => set({ imageModel })} />
              </Field>
              <Field label="Prompt packshot" hint="facoltativo — incolla il tuo o genera con “Migliora descrizione”">
                <textarea
                  className="mono"
                  rows={6}
                  value={draft.prompt}
                  onChange={(e) => set({ prompt: e.target.value })}
                  placeholder="Studio packshot, amber glass dropper bottle, white minimal label, soft shadow, square crop…"
                />
              </Field>
              <Field label="Descrizione fissa" hint="facoltativa · riusata dalla regia">
                <input
                  value={draft.description}
                  onChange={(e) => set({ description: e.target.value })}
                  placeholder="Flacone ambrato, contagocce, etichetta bianca LUMEA"
                />
              </Field>
              <div className="row">
                <Action label="Migliora descrizione" busyLabel="Miglioro" variant="ghost" run={enhance} disabled={!draft.brief.trim()} />
                <Action label="Genera prodotto" busyLabel="Genero" run={generate} disabled={!draft.brief.trim() && !draft.prompt.trim()} />
              </div>
            </>
          )}
        </div>

        <div className="panel">
          <h2>I tuoi prodotti</h2>
          {props.db.products.length === 0 && <p className="muted">Ancora nessun prodotto.</p>}
          <div className="cards">
            {props.db.products.map((p) => (
              <div key={p.id} className={`card ${p.id === props.selectedId ? "selected" : ""}`} onClick={() => props.onSelect(p.id)}>
                <img src={mediaSrc(p.images[p.selected])} alt={p.name} />
                <div className="card-body">
                  <b>{p.name}</b>
                  <small>{p.source === "upload" ? "foto caricata" : "generato"}</small>
                </div>
              </div>
            ))}
          </div>
          {selected && (
            <>
              <Field label={`Descrizione fissa di ${selected.name}`} hint="correggila se l'etichetta è sbagliata">
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
              <div className="row end">
                <Action
                  label="Salva descrizione"
                  variant="ghost"
                  disabled={description === selected.description}
                  run={async () => {
                    await send(`/api/products/${selected.id}`, { description }, "PATCH")
                    await props.refresh()
                  }}
                />
                <Action
                  label="Elimina"
                  variant="danger"
                  run={async () => {
                    if (!confirm(`Eliminare ${selected.name}?`)) return
                    await send(`/api/products/${selected.id}`, {}, "DELETE")
                    props.onSelect("")
                    await props.refresh()
                  }}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
