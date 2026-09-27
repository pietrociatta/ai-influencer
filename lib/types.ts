export type Media = {
  /** fal CDN url, passed to models as reference */
  url: string
  /** file name inside data/media, served by /api/media */
  file: string
}

export type Influencer = {
  id: string
  name: string
  brief: string
  /** one-line English identity (age, face, hair, outfit), reused by the director */
  look: string
  prompt: string
  imageModel: string
  images: Media[]
  selected: number
  createdAt: string
}

export type Product = {
  id: string
  name: string
  brief: string
  /** one-line English appearance (container, colours, label text), reused by the director */
  description: string
  prompt?: string
  source: "upload" | "generated"
  images: Media[]
  selected: number
  createdAt: string
}

export type Clip = {
  id: string
  beat: string
  durationSec: number
  framePrompt: string
  videoPrompt: string
  frame?: Media
  frameModel?: string
  video?: Media
  videoModel?: string
  error?: string
}

export type Production = {
  id: string
  influencerId: string
  productId: string
  direction: string
  language: string
  imageModel: string
  videoModel: string
  clips: Clip[]
  montage?: Media
  createdAt: string
}

export type Db = {
  influencers: Influencer[]
  products: Product[]
  productions: Production[]
}
