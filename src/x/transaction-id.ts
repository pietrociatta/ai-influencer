import "../polyfills.js"
import {
  ClientTransaction,
  fetchXDocument,
} from "x-client-transaction-id"
import { createLogger } from "../logger.js"

const log = createLogger("x-tid")

const CACHE_TTL_MS = 30 * 60 * 1000

let cached: {
  tx: ClientTransaction
  expiresAt: number
} | null = null
let refreshPromise: Promise<ClientTransaction> | null = null

async function loadTransaction(): Promise<ClientTransaction> {
  if (cached && Date.now() < cached.expiresAt) {
    return cached.tx
  }

  if (!refreshPromise) {
    refreshPromise = (async () => {
      log.info("refreshing x-client-transaction-id keys from x.com")
      const document = await fetchXDocument()
      const tx = await ClientTransaction.create(document)
      cached = { tx, expiresAt: Date.now() + CACHE_TTL_MS }
      return tx
    })().finally(() => {
      refreshPromise = null
    })
  }

  return refreshPromise
}

export function invalidateTransactionCache(): void {
  cached = null
}

export async function transactionIdFor(
  method: string,
  apiPath: string,
): Promise<string> {
  const tx = await loadTransaction()
  return tx.generateTransactionId(method, apiPath)
}
