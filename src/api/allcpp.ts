import { Context } from 'koishi'
import { EventData } from '../render'

const ENDPOINT = 'https://www.allcpp.cn/allcpp/event/eventMainListV2.do'
const CDN_PREFIX = 'https://imagecdn3.allcpp.cn/upload'

interface RawEvent {
  id: number
  name: string
  tag?: string
  provName?: string
  cityName?: string
  areaName?: string
  enterAddress?: string
  type?: string
  wannaGoCount?: number
  circleCount?: number
  doujinshiCount?: number
  enterTime?: number
  startTime?: string
  appLogoPicUrl?: string
  logoPicUrl?: string
  enabled?: number
  ended?: boolean
  isOnline?: number
  evmtype?: number
}

interface AllcppResponse {
  result?: { total?: number; list?: RawEvent[] }
}

export interface AllcppEvent extends EventData {
  id: number
  type: string
  logoPicUrl: string
}

export function parseEvent(item: RawEvent): AllcppEvent {
  const cancelled = item.enabled === 5
  const typeMap: Record<number, string> = { 0: '综合展', 1: 'ONLY', 2: '茶会', 3: '漫展' }
  const tag = item.tag || ''
  const type = item.type || typeMap[item.evmtype || 0]
    || (tag.toUpperCase().includes('ONLY') ? 'ONLY' : tag.includes('茶会') || tag.includes('茶话会') ? '茶会' : '综合展')
  const imageUrl = (value?: string) => !value ? '' : value.startsWith('http') ? value : `${CDN_PREFIX}${value}`
  return {
    id: item.id,
    name: cancelled && !item.name.includes('(已取消)') ? `${item.name}(已取消)` : item.name,
    type,
    tag,
    location: [item.provName, item.cityName, item.areaName].filter(Boolean).join(' '),
    address: item.enterAddress || '',
    url: `https://www.allcpp.cn/allcpp/event/event.do?event=${item.id}`,
    wannaGoCount: item.wannaGoCount || 0,
    circleCount: item.circleCount || 0,
    doujinshiCount: item.doujinshiCount || 0,
    time: item.enterTime ? new Date(item.enterTime).toISOString().replace('T', ' ').slice(0, 19) : item.startTime || '',
    appLogoPicUrl: imageUrl(item.appLogoPicUrl),
    logoPicUrl: imageUrl(item.logoPicUrl),
    ended: item.enabled === 1 || item.ended ? '已结束' : item.enabled === 2 ? '筹备中' : item.enabled === 5 ? '已取消' : '未结束',
    isOnline: item.isOnline === 1 ? '线上' : '线下',
    source: 'allcpp',
  }
}

export async function searchAllcppEvents(ctx: Context, keyword: string, pageSize = 10) {
  const params = new URLSearchParams({ time: '8', sort: '1', keyword, pageNo: '1', pageSize: String(pageSize) })
  const response = await ctx.http.get<AllcppResponse>(`${ENDPOINT}?${params}`, {
    headers: {
      Accept: '*/*',
      Origin: 'https://cp.allcpp.cn',
      Referer: 'https://cp.allcpp.cn/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36',
    },
  })
  return {
    total: response.result?.total || 0,
    events: (response.result?.list || []).map(parseEvent),
  }
}
