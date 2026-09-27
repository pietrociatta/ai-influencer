import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "UGC Studio",
  description: "Influencer AI → prodotto → regia → video",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  )
}
