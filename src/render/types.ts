export type RenderSource = 'allcpp' | 'bilibili'

export interface EventData {
  name: string
  location: string
  address: string
  time: string
  tag: string
  ended: string
  wannaGoCount: string | number
  circleCount: string | number
  doujinshiCount: string | number
  url: string
  isOnline: string | boolean
  appLogoPicUrl: string
  keyword?: string
  source?: RenderSource
  extraDetails?: Array<{ label: string; value: string; icon?: string }>
}
