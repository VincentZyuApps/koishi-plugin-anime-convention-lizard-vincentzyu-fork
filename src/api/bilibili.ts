import { Context } from 'koishi'
import { areaCodeToName, areaNameToCode } from '../area'
import { EventData } from '../render'

const LIST_ENDPOINT = 'https://show.bilibili.com/api/ticket/project/listV2'
const DETAIL_ENDPOINT = 'https://show.bilibili.com/api/ticket/project/getV2'
const AREA_INPUT_REGEX = /^[\u4e00-\u9fa5]{2,7}(?:省|市|区|县)?$/
const MUNICIPALITY_PREFIXES = new Set(['11', '12', '31', '50'])

export const BILI_SCOPES = ['漫展', '展览', '演出', '本地生活', '全部', '自定义'] as const
export type BiliScope = typeof BILI_SCOPES[number]

export const BILI_CHANNELS = ['展览', '演出', '本地生活', '混合'] as const
export type BiliChannel = typeof BILI_CHANNELS[number]

export const BILI_CATEGORIES = [
  '漫展', 'Only同人展', 'IP展览', '其他展览',
  '演唱会', '音乐会', 'livehouse', '其他演出', '话剧', '音乐剧', '音乐节',
  '主题餐厅', '快闪', '见面会', '其他活动', '电竞赛事',
] as const

export interface BiliConfig {
  biliDefaultScope: BiliScope
  biliEnableFanout: boolean
  biliFanoutConcurrency: number
  biliMaxResults: number
  biliCustomChannels: BiliChannel[]
  biliCustomCategories: string[]
  biliExtraCategories: Array<{ name: string; enabled: boolean }>
}
interface BiliRawProject {
  id: number
  project_id: number
  project_name: string
  city?: string
  cover?: string
  tags?: Array<{ name?: string }>
  wish?: number
  wish_text?: string
  jump_url?: string
  sale_flag?: string
  sale_flag_number?: number
  price_low?: number
  price_high?: number
  price_text?: string
  start_time?: string
  end_time?: string
  start_unix?: number
  venue_name?: string
  district_name?: string
  sale_point?: string
  third_category_name?: string
}

interface BiliListResponse {
  code?: number
  errno?: number
  message?: string
  msg?: string
  data?: {
    result?: BiliRawProject[]
  }
}

interface BiliDetailResponse {
  code?: number
  errno?: number
  message?: string
  msg?: string
  data?: {
    guests?: Array<{
      id?: number
      guest_id?: number
      name?: string
      description?: string
      book_num?: number
    }>
  }
}

export interface BiliEvent extends EventData {
  source: 'bilibili'
  projectId: number
  category: string
  saleFlag: string
  startUnix: number
}

export interface BiliSearchResult {
  areaCode: string
  areaName: string
  scope: BiliScope
  events: BiliEvent[]
  totalBeforeLimit: number
  queriedAreas: number
  failedRequests: number
}

interface ScopePlan {
  channels: BiliChannel[]
  categories?: string[]
}

function getScopePlan(config: BiliConfig, scope: BiliScope): ScopePlan {
  switch (scope) {
    case '漫展':
      return {
        channels: ['展览', '混合'],
        categories: ['漫展', 'Only同人展', 'IP展览', '其他展览'],
      }
    case '展览':
      return { channels: ['展览'] }
    case '演出':
      return { channels: ['演出'] }
    case '本地生活':
      return { channels: ['本地生活'] }
    case '全部':
      return { channels: ['展览', '演出', '本地生活', '混合'] }
    case '自定义': {
      const extraCategories = config.biliExtraCategories
        .filter(item => item.enabled && item.name.trim())
        .map(item => item.name.trim())
      const categories = [...new Set([...config.biliCustomCategories, ...extraCategories])]
      return {
        channels: config.biliCustomChannels.length ? config.biliCustomChannels : ['展览', '混合'],
        categories: categories.length ? categories : undefined,
      }
  }
}
}

function getRequestPType(channel: BiliChannel) {
  return channel === '混合' ? undefined : channel
}

function formatPrice(low?: number, high?: number, priceText?: string) {
  if (priceText) return priceText
  if (typeof low !== 'number' || typeof high !== 'number') return ''
  const lowPrice = (low / 100).toFixed(2).replace(/\.00$/, '')
  const highPrice = (high / 100).toFixed(2).replace(/\.00$/, '')
  return low === high ? `￥${lowPrice}` : `￥${lowPrice} - ￥${highPrice}`
}

function formatTime(start?: string, end?: string) {
  if (!start) return ''
  return end && end !== start ? `${start} - ${end}` : start
}

function formatStatus(flagNumber?: number) {
  if (flagNumber === 1) return '未开始'
  if ([3, 4, 5].includes(flagNumber || 0)) return '已结束'
  return '进行中'
}

function normalizeCover(cover?: string) {
  if (!cover) return ''
  return cover.startsWith('//') ? `https:${cover}` : cover
}

function parseProject(project: BiliRawProject): BiliEvent {
  const category = project.third_category_name || '未分类'
  const tags = [category, ...(project.tags || []).map(tag => tag.name).filter(Boolean) as string[]]
  const projectId = project.project_id ?? project.id
  const price = formatPrice(project.price_low, project.price_high, project.price_text)

  return {
    source: 'bilibili',
    projectId,
    name: project.project_name,
    category,
    saleFlag: project.sale_flag || '未知',
    location: [project.city, project.district_name].filter(Boolean).join(' ') || '未知地区',
    address: project.venue_name || '未知场馆',
    time: formatTime(project.start_time, project.end_time),
    tag: tags.join(' | '),
    ended: formatStatus(project.sale_flag_number),
    wannaGoCount: project.wish_text || project.wish || 0,
    circleCount: 0,
    doujinshiCount: 0,
    url: project.jump_url || `https://show.bilibili.com/platform/detail.html?id=${projectId}`,
    isOnline: '线下',
    appLogoPicUrl: normalizeCover(project.cover),
    startUnix: project.start_unix || Number.MAX_SAFE_INTEGER,
    extraDetails: [
      { label: '类别', value: category, icon: '🗂️' },
      { label: '售卖', value: project.sale_flag || '未知', icon: '🎫' },
      ...(price ? [{ label: '价格', value: price, icon: '💴' }] : []),
      ...(project.sale_point ? [{ label: '活动说明', value: project.sale_point, icon: '✨' }] : []),
    ],
  }
}

function buildListUrl(area: string, pType?: string) {
  const params = new URLSearchParams({
    version: '134',
    page: '1',
    pagesize: '20',
    area,
    filter: '',
    platform: 'web',
  })
  if (pType) params.set('p_type', pType)
  return `${LIST_ENDPOINT}?${params.toString()}`
}

async function fetchProjects(ctx: Context, area: string, channel: BiliChannel) {
  const response = await ctx.http.get<BiliListResponse>(buildListUrl(area, getRequestPType(channel)), {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://show.bilibili.com/platform/home.html',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36',
    },
  })

  if (response.code && response.code !== 0) {
    throw new Error(response.message || response.msg || `B站接口错误：${response.code}`)
  }
  if (response.errno && response.errno !== 0) {
    throw new Error(response.message || response.msg || `B站接口错误：${response.errno}`)
  }
  return response.data?.result || []
}

function getFanoutAreas(areaCode: string) {
  const provincePrefix = areaCode.slice(0, 2)
  const isMunicipality = MUNICIPALITY_PREFIXES.has(provincePrefix)
  const isProvince = areaCode.endsWith('0000')
  const isCity = areaCode.endsWith('00') && !isProvince
  const canFanout = isMunicipality || isCity

  if (!canFanout) return [areaCode]
  if (isProvince && !isMunicipality) return [areaCode]

  const cityPrefix = isMunicipality ? `${provincePrefix}01` : areaCode.slice(0, 4)
  const children = Object.keys(areaCodeToName)
    .filter(code => code.startsWith(cityPrefix) && code !== areaCode)
  return [...new Set([areaCode, ...children])]
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>) {
  const results: R[] = []
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++
      results[index] = await callback(items[index])
    }
  })
  await Promise.all(workers)
  return results
}

export function resolveBiliArea(input: string): string | null {
  const text = input.trim()
  if (!AREA_INPUT_REGEX.test(text)) return null
  return areaNameToCode[text]
    || areaNameToCode[`${text}省`]
    || areaNameToCode[`${text}市`]
    || areaNameToCode[`${text}区`]
    || areaNameToCode[`${text}县`]
    || null
}

export function normalizeBiliScope(scope?: string): BiliScope | null {
  if (!scope) return null
  return (BILI_SCOPES as readonly string[]).includes(scope) ? scope as BiliScope : null
}

export function describeBiliScope(scope: BiliScope) {
  const descriptions: Record<BiliScope, string> = {
    漫展: '展览 + 混合，保留漫展、Only同人展、IP展览和其他展览',
    展览: '仅查询展览频道',
    演出: '仅查询演出频道',
    本地生活: '仅查询本地生活频道',
    全部: '查询全部频道，不按体裁过滤',
    自定义: '使用管理员配置的频道和体裁规则',
  }
  return descriptions[scope]
}

export async function searchBiliEvents(
  ctx: Context,
  config: BiliConfig,
  areaCode: string,
  scope: BiliScope,
  fanout: boolean,
): Promise<BiliSearchResult> {
  const plan = getScopePlan(config, scope)
  const areas = fanout ? getFanoutAreas(areaCode) : [areaCode]
  const requests = areas.flatMap(area => plan.channels.map(channel => ({ area, channel })))
  let failedRequests = 0

  const results = await mapWithConcurrency(requests, fanout ? config.biliFanoutConcurrency : Math.max(1, plan.channels.length), async ({ area, channel }) => {
    try {
      return await fetchProjects(ctx, area, channel)
    } catch (error) {
      failedRequests++
      ctx.logger.warn(`[漫展B] ${areaCodeToName[area] || area} ${channel} 查询失败: ${error}`)
      return []
    }
  })

  if (failedRequests === requests.length) {
    throw new Error('B站会员购接口请求失败，请稍后重试。')
  }

  const allowedCategories = plan.categories ? new Set(plan.categories) : null
  const deduplicated = new Map<number, BiliEvent>()
  for (const project of results.flat()) {
    const event = parseProject(project)
    if (allowedCategories && !allowedCategories.has(event.category)) continue
    if (!deduplicated.has(event.projectId)) deduplicated.set(event.projectId, event)
  }

  const sorted = [...deduplicated.values()].sort((left, right) => left.startUnix - right.startUnix)
  return {
    areaCode,
    areaName: areaCodeToName[areaCode] || areaCode,
    scope,
    events: sorted.slice(0, config.biliMaxResults),
    totalBeforeLimit: sorted.length,
    queriedAreas: areas.length,
    failedRequests,
  }
}

export async function enrichBiliEventDetail(ctx: Context, event: BiliEvent): Promise<BiliEvent> {
  const params = new URLSearchParams({
    version: '134',
    id: String(event.projectId),
    project_id: String(event.projectId),
    requestSource: 'pc-new',
  })
  const response = await ctx.http.get<BiliDetailResponse>(`${DETAIL_ENDPOINT}?${params.toString()}`, {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: 'https://show.bilibili.com/',
    },
  })
  const guests = (response.data?.guests || [])
    .filter(guest => guest.name)
    .map(guest => guest.description ? `${guest.name}（${guest.description}）` : guest.name!)

  if (!guests.length) return event
  return {
    ...event,
    extraDetails: [
      ...(event.extraDetails || []),
      { label: '嘉宾', value: guests.join(' / '), icon: '🌟' },
    ],
  }
}
