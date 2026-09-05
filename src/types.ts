export type TweetMetrics = {
  likes: number
  retweets: number
  replies: number
  quotes?: number
  views?: number
}

export type Tweet = {
  id: string
  username: string
  userId?: string
  text: string
  createdAt: string
  lang?: string
  metrics?: TweetMetrics
  fetchedAt: string
}
