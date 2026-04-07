import { Context } from 'koishi';

export interface ApiConfig {
  apiUrl: string;
  priorityMode: 'proxy' | 'local' | 'distributed';
  localServerHost: string;
  localServerPort: number;
}

const CPP_API_BASE = 'https://www.allcpp.cn/allcpp/event/eventMainListV2.do';
const CDN_PREFIX = 'https://imagecdn3.allcpp.cn/upload';

interface CPPEventItem {
  id: number;
  name: string;
  tag: string;
  provName: string;
  cityName: string;
  areaName: string;
  enterAddress: string;
  type: string;
  wannaGoCount: number;
  circleCount: number;
  doujinshiCount: number;
  enterTime: number;
  endTime: number;
  startTime: string;
  appLogoPicUrl: string;
  logoPicUrl: string;
  enabled: number;
  ended: boolean;
  isOnline: number;
  evmtype: number;
}

interface CPPResponse {
  result: {
    total: number;
    list: CPPEventItem[];
  };
}

interface Event {
  id: number;
  name: string;
  tag: string;
  location: string;
  address: string;
  url: string;
  type: string;
  wannaGoCount: number;
  circleCount: number;
  doujinshiCount: number;
  time: string;
  appLogoPicUrl: string;
  logoPicUrl: string;
  ended: string;
  isOnline: string;
}

function parseLocation(item: CPPEventItem): string {
  const parts: string[] = [];
  if (item.provName) parts.push(item.provName);
  if (item.cityName) parts.push(item.cityName);
  if (item.areaName) parts.push(item.areaName);
  return parts.join(' ');
}

function parseType(item: CPPEventItem): string {
  if (item.type) return item.type;
  const typeMap: Record<number, string> = {
    0: '综合展',
    1: 'ONLY',
    2: '茶会',
    3: '漫展',
  };
  if (typeMap[item.evmtype]) return typeMap[item.evmtype];
  const tag = item.tag.toUpperCase();
  if (tag.includes('ONLY')) return 'ONLY';
  if (tag.includes('茶会') || tag.includes('茶话会')) return '茶会';
  return '综合展';
}

function parseTime(item: CPPEventItem): string {
  if (item.enterTime > 0) {
    return new Date(item.enterTime).toISOString().replace('T', ' ').substring(0, 19);
  }
  if (item.startTime) return item.startTime;
  return '';
}

function parseImageURL(url: string): string {
  if (!url) return '';
  if (!url.startsWith('http')) return CDN_PREFIX + url;
  return url;
}

function parseEnded(item: CPPEventItem): string {
  switch (item.enabled) {
    case 1: return '已结束';
    case 2: return '筹备中';
    case 5: return '已取消';
  }
  if (item.ended) return '已结束';
  return '未结束';
}

export function parseEvent(item: CPPEventItem): Event {
  const isCancelled = item.enabled === 5;
  let name = item.name;
  if (isCancelled && !name.includes('(已取消)')) {
    name += '(已取消)';
  }
  
  const isOnline = item.isOnline === 1 ? '线上' : '线下';

  return {
    id: item.id,
    name,
    tag: item.tag,
    location: parseLocation(item),
    address: item.enterAddress,
    url: `https://www.allcpp.cn/allcpp/event/event.do?event=${item.id}`,
    type: parseType(item),
    wannaGoCount: item.wannaGoCount,
    circleCount: item.circleCount,
    doujinshiCount: item.doujinshiCount,
    time: parseTime(item),
    appLogoPicUrl: parseImageURL(item.appLogoPicUrl),
    logoPicUrl: parseImageURL(item.logoPicUrl),
    ended: parseEnded(item),
    isOnline,
  };
}

async function fetchPage(ctx: Context, keyword: string, page: number, pageSize: number = 10): Promise<CPPResponse> {
  const params = new URLSearchParams({
    time: '8',
    sort: '1',
    keyword,
    pageNo: String(page),
    pageSize: String(pageSize),
  });

  const url = `${CPP_API_BASE}?${params.toString()}`;
  ctx.logger.info(`[漫展-API][local] 请求URL: ${url}`);

  const response = await ctx.http.get(url, {
    headers: {
      'Host': 'www.allcpp.cn',
      'Connection': 'keep-alive',
      'Accept': '*/*',
      'errorWrap': 'json',
      'Origin': 'https://cp.allcpp.cn',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Dest': 'empty',
      'Referer': 'https://cp.allcpp.cn/',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
    },
  });

  return response as CPPResponse;
}

function getApiUrl(config: ApiConfig): string {
  if (config.priorityMode === 'distributed') {
    // 0.0.0.0 是绑定地址，实际连接需要用 127.0.0.1
    const host = config.localServerHost === '0.0.0.0' ? '127.0.0.1' : config.localServerHost;
    const url = `http://${host}:${config.localServerPort}/search`;
    return url;
  }
  return config.apiUrl;
}

export async function searchEvents(ctx: Context, config: ApiConfig, keyword: string): Promise<{ code: number; msg: string; data: Event[] }> {
  try {
    let response: any;
    
    if (config.priorityMode === 'local') {
      ctx.logger.info(`[漫展-API][local] 模式=local, 关键词=${keyword}`);
      response = await fetchPage(ctx, keyword, 1);
      ctx.logger.info(`[漫展-API][local] 收到响应, total=${response.result?.total}, list长度=${response.result?.list?.length}`);
    } else {
      const apiUrl = getApiUrl(config) + '?msg=' + encodeURIComponent(keyword);
      ctx.logger.info(`[漫展-API][${config.priorityMode}] 请求URL: ${apiUrl}`);
      try {
        response = await ctx.http.get(apiUrl);
        ctx.logger.info(`[漫展-API][${config.priorityMode}] 收到响应: ${JSON.stringify(response).slice(0, 500)}`);
      } catch (httpError: any) {
        ctx.logger.error(`[漫展-API][${config.priorityMode}] HTTP请求失败: ${httpError.message}`);
        throw httpError;
      }
    }

    if (config.priorityMode === 'local') {
      const allEvents: Event[] = response.result?.list?.map(parseEvent) || [];
      ctx.logger.info(`[漫展-API][local] 解析后事件数量: ${allEvents.length}`);
      return {
        code: 200,
        msg: keyword,
        data: allEvents,
      };
    }
    return response;
  } catch (error: any) {
    ctx.logger.error(`[漫展-API] 异常: ${error.message}, stack=${error.stack}`);
    return {
      code: 500,
      msg: error.message || '请求失败',
      data: [],
    };
  }
}

export async function searchAllEvents(ctx: Context, config: ApiConfig): Promise<{ code: number; msg: string; data: Event[]; total?: number }> {
  try {
    let response: any;
    
    if (config.priorityMode === 'local') {
      response = await fetchPage(ctx, '', 1, 100);
    } else {
      const baseUrl = config.priorityMode === 'distributed' 
        ? `http://${config.localServerHost === '0.0.0.0' ? '127.0.0.1' : config.localServerHost}:${config.localServerPort}` 
        : config.apiUrl;
      response = await ctx.http.get(baseUrl.replace('/search', '/search_all'));
    }

    if (config.priorityMode === 'local') {
      const allEvents: Event[] = response.result?.list?.map(parseEvent) || [];
      return {
        code: 200,
        msg: '所有漫展',
        total: response.result?.total || 0,
        data: allEvents,
      };
    }
    return response;
  } catch (error: any) {
    return {
      code: 500,
      msg: error.message || '请求失败',
      data: [],
    };
  }
}