"use client"

import { useContext, useEffect, useState } from "react"
import { DEFAULT_IMAGE_MODEL, IMAGE_MODELS } from "@/lib/models"
import type { Db, Influencer } from "@/lib/types"
import { mediaSrc, send } from "./api"
import { Action, Field, ModelSelect, ReportContext } from "./kit"

type Draft = { name: string; brief: string; look: string; prompt: string; imageModel: string }

const emptyDraft: Draft = { name: "", brief: "", look: "", prompt: "", imageModel: DEFAULT_IMAGE_MODEL }

export function InfluencerStep(props: {
  db: Db
  refresh: () => Promise<void>
  selectedId: string
  onSelect: (id: string) => void
  onNext: () => void
}) {
  const report = useContext(ReportContext)
  const selected = props.db.influencers.find((i) => i.id === props.selectedId)
  const [editingId, setEditingId] = useState<string | undefined>()
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))

  const load = (inf?: Influencer) => {
    setEditingId(inf?.id)
    setDraft(inf ? { name: inf.name, brief: inf.brief, look: inf.look, prompt: inf.prompt, imageModel: inf.imageModel } : emptyDraft)
  }
  useEffect(() => {
    if (selected && editingId === undefined && !draft.brief) load(selected)
  }, [selected?.id])

  const enhance = async () => {
    const res = await send<{ name: string; look: string; prompt: string }>("/api/influencers/enhance", { brief: draft.brief })
    const next = { ...draft, name: draft.name || res.name, look: res.look, prompt: res.prompt }
    setDraft(next)
    return next
  }

  const generate = async () => {
    const ready = draft.prompt.trim() ? draft : await enhance()
    const inf = await send<Influencer & { notice?: string }>("/api/influencers", { ...ready, id: editingId })
    if (inf.notice) report(inf.notice, "info")
    await props.refresh()
    props.onSelect(inf.id)
    setEditingId(inf.id)
  }

  return (
    <section className="step-page">
      <header className="step-head">
        <div>
          <h1>1 · Crea l&apos;influencer</h1>
          <p>
            Scrivi una descrizione breve (la miglioro io) oppure incolla direttamente il prompt immagine. Genero il ritratto di riferimento che
            terrà ferma la faccia in tutti i video.
          </p>
        </div>
        <button className="btn ghost" disabled={!selected} onClick={props.onNext}>
          Avanti: prodotto →
        </button>
      </header>

      <div className="split">
        <div className="panel">
          <div className="panel-head">
            <h2>{editingId ? `Varianti di ${draft.name || "influencer"}` : "Nuovo influencer"}</h2>
            {editingId && (
              <button className="link" onClick={() => load(undefined)}>
                + nuovo
              </button>
            )}
          </div>
          <Field label="Nome" hint="facoltativo">
            <input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Giulia" />
          </Field>
          <Field label="Descrizione breve">
            <textarea
              rows={3}
              value={draft.brief}
              onChange={(e) => set({ brief: e.target.value })}
              placeholder="Ragazza milanese sui 27 anni, capelli castani mossi, lentiggini, stile casual beige, vibe skincare"
            />
          </Field>
          <Field label="Modello immagine">
            <ModelSelect models={IMAGE_MODELS} value={draft.imageModel} onChange={(imageModel) => set({ imageModel })} />
          </Field>
          <Field label="Prompt immagine" hint="facoltativo — incolla il tuo o genera con “Migliora descrizione”">
            <textarea
              className="mono"
              rows={8}
              value={draft.prompt}
              onChange={(e) => set({ prompt: e.target.value })}
              placeholder="Portrait photo of a 27-year-old Milanese woman, soft window light, neutral beige background, 3:4 framing…"
            />
          </Field>
          <Field label="Look" hint="facoltativo · una riga, riusata dalla regia">
            <input value={draft.look} onChange={(e) => set({ look: e.target.value })} placeholder="Castani mossi, lentiggini, maglietta beige" />
          </Field>
          <div className="row">
            <Action label="Migliora descrizione" busyLabel="Miglioro" variant="ghost" run={enhance} disabled={!draft.brief.trim()} />
            <Action
              label={editingId ? "Genera variante" : "Genera influencer"}
              busyLabel="Genero"
              run={generate}
              disabled={!draft.brief.trim() && !draft.prompt.trim()}
            />
          </div>
        </div>

        <div className="panel">
          <h2>I tuoi influencer</h2>
          {props.db.influencers.length === 0 && <p className="muted">Ancora nessuno. Generane uno a sinistra.</p>}
          <div className="cards">
            {props.db.influencers.map((inf) => (
              <div
                key={inf.id}
                className={`card ${inf.id === props.selectedId ? "selected" : ""}`}
                onClick={() => {
                  props.onSelect(inf.id)
                  load(inf)
                }}
              >
                <img src={mediaSrc(inf.images[inf.selected])} alt={inf.name} />
                <div className="card-body">
                  <b>{inf.name}</b>
                  <small>{inf.look}</small>
                </div>
              </div>
            ))}
          </div>

          {selected && selected.images.length > 1 && (
            <div className="variants">
              <h3>Ritratto di riferimento di {selected.name}</h3>
              <div className="thumbs">
                {selected.images.map((img, i) => (
                  <img
                    key={img.file}
                    src={mediaSrc(img)}
                    alt=""
                    className={i === selected.selected ? "on" : ""}
                    onClick={async () => {
                      await send(`/api/influencers/${selected.id}`, { selected: i }, "PATCH")
                      await props.refresh()
                    }}
                  />
                ))}
              </div>
            </div>
          )}
          {selected && (
            <div className="row end">
              <Action
                label="Elimina"
                variant="danger"
                run={async () => {
                  if (!confirm(`Eliminare ${selected.name}?`)) return
                  await send(`/api/influencers/${selected.id}`, {}, "DELETE")
                  props.onSelect("")
                  load(undefined)
                  await props.refresh()
                }}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
