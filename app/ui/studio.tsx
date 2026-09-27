"use client"

import { useCallback, useEffect, useState } from "react"
import type { Db } from "@/lib/types"
import { api, mediaSrc } from "./api"
import { DirectionStep } from "./direction-step"
import { InfluencerStep } from "./influencer-step"
import { ReportContext, useStoredState, type Report } from "./kit"
import { ProductStep } from "./product-step"

const STEPS = [
  { id: "influencer", n: 1, label: "Influencer" },
  { id: "product", n: 2, label: "Prodotto" },
  { id: "direction", n: 3, label: "Regia & video" },
] as const

type StepId = (typeof STEPS)[number]["id"]

export function Studio() {
  const [db, setDb] = useState<Db>({ influencers: [], products: [], productions: [] })
  const [step, setStep] = useStoredState<StepId>("ugc.step", "influencer")
  const [influencerId, setInfluencerId] = useStoredState<string>("ugc.influencer", "")
  const [productId, setProductId] = useStoredState<string>("ugc.product", "")
  const [toast, setToast] = useState<{ message: string; kind: "error" | "info" } | null>(null)
  const report = useCallback<Report>((message, kind = "error") => setToast({ message, kind }), [])

  const refresh = useCallback(async () => setDb(await api<Db>("/api/state")), [])
  useEffect(() => {
    refresh().catch((e) => report(String(e)))
  }, [refresh, report])

  const influencer = db.influencers.find((i) => i.id === influencerId)
  const product = db.products.find((p) => p.id === productId)

  return (
    <ReportContext.Provider value={report}>
      <div className="shell">
        <aside className="rail">
          <div className="brand">
            UGC<span>studio</span>
          </div>
          <nav>
            {STEPS.map((s) => (
              <button key={s.id} className={`step ${step === s.id ? "active" : ""}`} onClick={() => setStep(s.id)}>
                <b>{s.n}</b>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="cast">
            <div className="cast-item">
              {influencer ? (
                <img src={mediaSrc(influencer.images[influencer.selected])} alt="" />
              ) : (
                <div className="cast-empty">?</div>
              )}
              <span>{influencer?.name ?? "Nessun influencer"}</span>
            </div>
            <div className="cast-item">
              {product ? <img src={mediaSrc(product.images[product.selected])} alt="" /> : <div className="cast-empty">?</div>}
              <span>{product?.name ?? "Nessun prodotto"}</span>
            </div>
          </div>
        </aside>

        <main className="main">
          {toast && (
            <div className={`toast ${toast.kind}`} onClick={() => setToast(null)}>
              {toast.message} <span>×</span>
            </div>
          )}
          {step === "influencer" && (
            <InfluencerStep
              db={db}
              refresh={refresh}
              selectedId={influencerId}
              onSelect={setInfluencerId}
              onNext={() => setStep("product")}
            />
          )}
          {step === "product" && (
            <ProductStep
              db={db}
              refresh={refresh}
              selectedId={productId}
              onSelect={setProductId}
              onNext={() => setStep("direction")}
            />
          )}
          {step === "direction" && (
            <DirectionStep db={db} refresh={refresh} influencer={influencer} product={product} goTo={setStep} />
          )}
        </main>
      </div>
    </ReportContext.Provider>
  )
}
