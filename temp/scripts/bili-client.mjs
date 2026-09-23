const LIST_ENDPOINT = 'https://show.bilibili.com/api/ticket/project/listV2'
const DETAIL_ENDPOINT = 'https://show.bilibili.com/api/ticket/project/getV2'

const headers = {
  'accept': 'application/json, text/plain, */*',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0.0.0 Safari/537.36',
  'referer': 'https://show.bilibili.com/platform/home.html',
}

function buildUrl(endpoint, parameters) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) search.set(key, String(value))
  }
  return `${endpoint}?${search}`
}

export async function requestJson(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) })
  const body = await response.text()
  let json
  try {
    json = JSON.parse(body)
  } catch {
    throw new Error(`HTTP ${response.status}: response was not JSON (${body.slice(0, 160)})`)
  }
  return { status: response.status, json, url }
}

export async function listProjects({
  area,
  pType,
  page = 1,
  pageSize = 20,
  filter = '',
  extra = {},
}) {
  const parameters = {
    version: 134,
    page,
    pagesize: pageSize,
    area,
    filter,
    platform: 'web',
    ...extra,
  }
  if (pType !== undefined) parameters.p_type = pType
  return requestJson(buildUrl(LIST_ENDPOINT, parameters))
}

export async function getProjectDetail(projectId) {
  return requestJson(buildUrl(DETAIL_ENDPOINT, {
    version: 134,
    id: projectId,
    project_id: projectId,
    requestSource: 'pc-new',
  }))
}

export function extractProjects(result) {
  return Array.isArray(result.json?.data?.result) ? result.json.data.result : []
}

export function projectIds(projects) {
  return projects.map((project) => project.project_id ?? project.id)
}

export function categoryCounts(projects) {
  return Object.fromEntries(Object.entries(projects.reduce((counts, project) => {
    const category = project.third_category_name || '(missing)'
    counts[category] = (counts[category] || 0) + 1
    return counts
  }, {})).sort(([left], [right]) => left.localeCompare(right, 'zh-CN')))
}

export function compactProject(project) {
  return {
    id: project.project_id ?? project.id,
    name: project.project_name,
    category: project.third_category_name,
    city: project.city,
    district: project.district_name,
    venue: project.venue_name,
    start: project.start_time,
    end: project.end_time,
    saleFlag: project.sale_flag,
    wish: project.wish,
    cover: project.cover,
  }
}

export { DETAIL_ENDPOINT, LIST_ENDPOINT }
