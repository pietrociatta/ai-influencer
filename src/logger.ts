export function createLogger(scope: string) {
  const log = (
    level: "info" | "warn" | "error" | "debug",
    msg: string,
    extra?: unknown,
  ) => {
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} (${scope}) ${msg}`
    const args = extra === undefined ? [line] : [line, extra]
    if (level === "error") console.error(...args)
    else if (level === "warn") console.warn(...args)
    else if (level === "debug") {
      if (process.env.DEBUG) console.log(...args)
    } else console.log(...args)
  }

  return {
    info: (msg: string, extra?: unknown) => log("info", msg, extra),
    warn: (msg: string, extra?: unknown) => log("warn", msg, extra),
    error: (msg: string, extra?: unknown) => log("error", msg, extra),
    debug: (msg: string, extra?: unknown) => log("debug", msg, extra),
  }
}
