"use client"

import { useContext, useEffect, useState } from "react"
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, IMAGE_MODELS, VIDEO_MODELS, imageModel, videoModel } from "@/lib/models"
import type { Clip, Db, Influencer, Product, Production } from "@/lib/types"
import { mediaSrc, send } from "./api"
import { Action, Field, ModelSelect, ReportContext, useStoredState } from "./kit"

const LANGUAGES = ["Italiano", "English", "Español", "Français", "Deutsch"]

export function DirectionStep(props: {
  db: Db
  refresh: () => Promise<void>
  influencer?: Influencer
  product?: Product
  goTo: (step: "influencer" | "product") => void
}) {
  const { influencer, product } = props
  const [productionId, setProductionId] = useStoredState<string>("ugc.production", "")
  const [direction, setDirection] = useState("")
  const [language, setLanguage] = useStoredState("ugc.language", "Italiano")
  const [clipCount, setClipCount] = useState("auto")
  const [imageModelId, setImageModelId] = useStoredState("ugc.frameModel", DEFAULT_IMAGE_MODEL)
  const [videoModelId, setVideoModelId] = useStoredState("ugc.videoModel", DEFAULT_VIDEO_MODEL)

  const production = props.db.productions.find((p) => p.id === productionId)
  const history = props.db.productions.filter(
    (p) => p.influencerId === influencer?.id && p.productId === product?.id,
  )

  useEffect(() => {
    if (!production) return
    setDirection(production.direction)
    setLanguage(production.language)
  }, [production?.id])

  if (!influencer || !product) {
    return (
      <section className="step-page">
        <header className="step-head">
          <div>
            <h1>3 · Regia &amp; video</h1>
            <p>Prima scegli chi e cosa.</p>
          </div>
        </header>
        <div className="panel">
          {!influencer && (
            <p>
              Manca l&apos;influencer. <button className="link" onClick={() => props.goTo("influencer")}>Vai allo step 1</button>
            </p>
          )}
          {!product && (
            <p>
              Manca il prodotto. <button className="link" onClick={() => props.goTo("product")}>Vai allo step 2</button>
            </p>
          )}
        </div>
      </section>
    )
  }

  const write = async (rewriteId?: string) => {
    const p = await send<Production>("/api/productions", {
      id: rewriteId,
      influencerId: influencer.id,
      productId: product.id,
      direction,
      language,
      clipCount,
      imageModel: imageModelId,
      videoModel: videoModelId,
    })
    await props.refresh()
    setProductionId(p.id)
  }

  const changeModels = async (patch: { imageModel?: string; videoModel?: string }) => {
    if (patch.imageModel) setImageModelId(patch.imageModel)
    if (patch.videoModel) setVideoModelId(patch.videoModel)
    if (production) {
      await send(`/api/productions/${production.id}`, patch, "PATCH")
      await props.refresh()
    }
  }

  const vm = videoModel(production?.videoModel ?? videoModelId)
  const stylesDiffer = production && videoModel(production.videoModel).promptStyle !== videoModel(videoModelId).promptStyle

  return (
    <section className="step-page">
      <header className="step-head">
        <div>
          <h1>3 · Regia &amp; video</h1>
          <p>
            Dimmi cosa deve fare {influencer.name} con {product.name}. Riscrivo tutto come shooting brief UGC (un soggetto, un prodotto,
            una camera, dialogo dal primo frame) e se serve divido in hook, prova e CTA come clip separate.
          </p>
        </div>
      </header>

      <div className="split direction">
        <div className="panel">
          <div className="duo">
            <img src={mediaSrc(influencer.images[influencer.selected])} alt="" />
            <span>+</span>
            <img src={mediaSrc(product.images[product.selected])} alt="" />
          </div>
          <Field label="Cosa deve fare">
            <textarea
              rows={6}
              value={direction}
              onChange={(e) => setDirection(e.target.value)}
              placeholder="In bagno la mattina, racconta che il siero le ha sistemato la pelle in due settimane, mostra come lo applica (due gocce, picchietta), chiude dicendo che costa meno di 30€ e il link è sotto."
            />
          </Field>
          <div className="grid2">
            <Field label="Lingua dialogo">
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Clip">
              <select value={clipCount} onChange={(e) => setClipCount(e.target.value)}>
                <option value="auto">Auto (1–3)</option>
                <option value="1">1 clip</option>
                <option value="2">2 clip</option>
                <option value="3">3 clip</option>
              </select>
            </Field>
          </div>
          <Field label="Modello video">
            <ModelSelect models={VIDEO_MODELS} value={videoModelId} onChange={(id) => changeModels({ videoModel: id })} />
          </Field>
          <Field label="Modello primo frame">
            <ModelSelect models={IMAGE_MODELS} value={imageModelId} onChange={(id) => changeModels({ imageModel: id })} />
          </Field>
          <div className="row">
            <Action label="Scrivi regia" busyLabel="Scrivo la regia" run={() => write()} disabled={!direction.trim()} />
            {production && (
              <Action
                label="Riscrivi questa"
                busyLabel="Riscrivo"
                variant="ghost"
                run={() => write(production.id)}
                disabled={!direction.trim()}
                title="Sostituisce le clip della produzione aperta"
              />
            )}
          </div>
          {stylesDiffer && (
            <p className="warn">Hai cambiato famiglia di modello: premi “Riscrivi questa” per adattare il formato del prompt.</p>
          )}

          {history.length > 0 && (
            <div className="history">
              <h3>Produzioni con questa coppia</h3>
              {history.map((p) => (
                <button key={p.id} className={p.id === productionId ? "on" : ""} onClick={() => setProductionId(p.id)}>
                  <span>{p.direction.slice(0, 70)}</span>
                  <small>
                    {p.clips.length} clip · {videoModel(p.videoModel).label}
                    {p.montage ? " · montato" : ""}
                  </small>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          {!production ? (
            <p className="muted">La regia apparirà qui: una card per clip, con prompt modificabili, primo frame e video.</p>
          ) : (
            <ProductionView production={production} refresh={props.refresh} usdPerSec={vm.usdPerSec} />
          )}
        </div>
      </div>
    </section>
  )
}

function ProductionView(props: { production: Production; refresh: () => Promise<void>; usdPerSec: number }) {
  const { production } = props
  const report = useContext(ReportContext)
  const seconds = production.clips.reduce((n, c) => n + c.durationSec, 0)
  const allVideos = production.clips.every((c) => c.video)
  const final = production.montage ?? (production.clips.length === 1 ? production.clips[0].video : undefined)

  const runClip = async (clip: Clip, kind: "frame" | "video") => {
    try {
      const res = await send<Clip & { notice?: string }>(`/api/productions/${production.id}/clips/${clip.id}/${kind}`, {})
      if (res.notice) report(res.notice, "info")
    } finally {
      await props.refresh()
    }
  }

  return (
    <div className="production">
      <div className="panel-head">
        <h2>
          {production.clips.length} clip · {seconds}s · ~${(seconds * props.usdPerSec).toFixed(2)} di video
        </h2>
        <div className="row">
          <Action
            label="Genera tutto"
            busyLabel="Genero le clip"
            run={async () => {
              const todo = production.clips.filter((c) => !c.video)
              const results = await Promise.allSettled(todo.map((c) => runClip(c, "video")))
              const failed = results.filter((r) => r.status === "rejected")
              if (failed.length) throw new Error(`${failed.length} clip fallite: ${String((failed[0] as PromiseRejectedResult).reason)}`)
            }}
            disabled={allVideos}
          />
          {production.clips.length > 1 && (
            <Action
              label="Monta video finale"
              busyLabel="Monto"
              variant="ghost"
              disabled={!allVideos}
              run={async () => {
                await send(`/api/productions/${production.id}/montage`, {})
                await props.refresh()
              }}
            />
          )}
        </div>
      </div>

      {final && (
        <div className="final">
          <video src={mediaSrc(final)} controls playsInline />
          <a className="btn ghost" href={mediaSrc(final)} download={`${production.id}.mp4`}>
            Scarica video finale
          </a>
        </div>
      )}

      {production.clips.map((clip, i) => (
        <ClipCard key={clip.id} index={i} clip={clip} productionId={production.id} refresh={props.refresh} run={runClip} />
      ))}
    </div>
  )
}

function ClipCard(props: {
  index: number
  clip: Clip
  productionId: string
  refresh: () => Promise<void>
  run: (clip: Clip, kind: "frame" | "video") => Promise<void>
}) {
  const { clip } = props
  const [framePrompt, setFramePrompt] = useState(clip.framePrompt)
  const [videoPrompt, setVideoPrompt] = useState(clip.videoPrompt)
  const [duration, setDuration] = useState(clip.durationSec)

  useEffect(() => setFramePrompt(clip.framePrompt), [clip.framePrompt])
  useEffect(() => setVideoPrompt(clip.videoPrompt), [clip.videoPrompt])
  useEffect(() => setDuration(clip.durationSec), [clip.durationSec])

  const save = async (edit: Partial<Clip>) => {
    await send(`/api/productions/${props.productionId}`, { clips: [{ id: clip.id, ...edit }] }, "PATCH")
    await props.refresh()
  }

  const used = [
    clip.frame && clip.frameModel && `frame · ${imageModel(clip.frameModel).label}`,
    clip.video && clip.videoModel && `video · ${videoModel(clip.videoModel).label}`,
  ].filter(Boolean) as string[]

  return (
    <article className="clip">
      <div className="clip-head">
        <b>
          Clip {props.index + 1} · {clip.beat}
        </b>
        <label className="duration">
          <input
            type="number"
            min={3}
            max={15}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            onBlur={() => duration !== clip.durationSec && save({ durationSec: duration })}
          />
          s
        </label>
      </div>
      <div className="clip-body">
        <div className="clip-prompts">
          <Field label="Primo frame" hint="Image 1 = influencer, Image 2 = prodotto">
            <textarea
              className="mono"
              rows={5}
              value={framePrompt}
              onChange={(e) => setFramePrompt(e.target.value)}
              onBlur={() => framePrompt !== clip.framePrompt && save({ framePrompt })}
            />
          </Field>
          <Field label="Prompt video">
            <textarea
              className="mono"
              rows={14}
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              onBlur={() => videoPrompt !== clip.videoPrompt && save({ videoPrompt })}
            />
          </Field>
        </div>
        <div className="clip-media">
          {clip.video ? (
            <video src={mediaSrc(clip.video)} controls playsInline poster={clip.frame ? mediaSrc(clip.frame) : undefined} />
          ) : clip.frame ? (
            <img src={mediaSrc(clip.frame)} alt="" />
          ) : (
            <div className="placeholder">9:16</div>
          )}
          <div className="row">
            <Action label={clip.frame ? "Rifai frame" : "Primo frame"} busyLabel="Frame" variant="ghost" run={() => props.run(clip, "frame")} />
            <Action label={clip.video ? "Rifai video" : "Genera video"} busyLabel="Video" run={() => props.run(clip, "video")} />
          </div>
          {used.length > 0 && <small className="muted mono">{used.join("\n")}</small>}
          {clip.error && <p className="warn">{clip.error}</p>}
        </div>
      </div>
    </article>
  )
}
