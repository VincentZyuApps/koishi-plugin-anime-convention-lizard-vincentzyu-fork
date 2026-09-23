import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import {
  categoryCounts,
  compactProject,
  extractProjects,
  listProjects,
  projectIds,
} from './bili-client.mjs'

const outputPath = resolve(import.meta.dirname, '../docs/bili-list-probe.json')

const areas = [
  ['北京市', '110000'],
  ['北京市朝阳区', '110105'],
  ['南京市', '320100'],
  ['上海市', '310000'],
  ['广州市', '440100'],
  ['成都市', '510100'],
  ['杭州市', '330100'],
]

const channels = [
  ['展览', '展览'],
  ['演出', '演出'],
  ['本地生活', '本地生活'],
  ['混合（不传 p_type）', undefined],
]

const rows = []
for (const [areaName, area] of areas) {
  for (const [channelName, pType] of channels) {
    const result = await listProjects({ area, pType })
    const projects = extractProjects(result)
    rows.push({
      areaName,
      area,
      channelName,
      pType: pType ?? null,
      httpStatus: result.status,
      code: result.json.code ?? result.json.errno,
      message: result.json.message ?? result.json.msg,
      declaredTotal: result.json.data?.total ?? null,
      receivedCount: projects.length,
      categories: categoryCounts(projects),
      projects: projects.slice(0, 5).map(compactProject),
    })
  }
}

const [pageOne, pageTwo, filterEmpty, filterWord, invalidPageSize] = await Promise.all([
  listProjects({ area: '110000', pType: '展览', page: 1 }),
  listProjects({ area: '110000', pType: '展览', page: 2 }),
  listProjects({ area: '110000', pType: undefined, filter: '' }),
  listProjects({ area: '110000', pType: undefined, filter: '东方' }),
  listProjects({ area: '110000', pType: '展览', pageSize: 30 }),
])

const experiments = {
  pagination: {
    pageOneIds: projectIds(extractProjects(pageOne)),
    pageTwoIds: projectIds(extractProjects(pageTwo)),
    sameProjects: JSON.stringify(projectIds(extractProjects(pageOne))) === JSON.stringify(projectIds(extractProjects(pageTwo))),
    pageOneDeclaredTotal: pageOne.json.data?.total ?? null,
    pageTwoDeclaredTotal: pageTwo.json.data?.total ?? null,
  },
  filter: {
    emptyIds: projectIds(extractProjects(filterEmpty)),
    wordIds: projectIds(extractProjects(filterWord)),
    sameProjects: JSON.stringify(projectIds(extractProjects(filterEmpty))) === JSON.stringify(projectIds(extractProjects(filterWord))),
  },
  pageSize30: {
    httpStatus: invalidPageSize.status,
    code: invalidPageSize.json.code ?? invalidPageSize.json.errno,
    message: invalidPageSize.json.message ?? invalidPageSize.json.msg,
  },
}

const report = { generatedAt: new Date().toISOString(), rows, experiments }
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')

console.log(`Wrote ${outputPath}`)
console.table(rows.map((row) => ({
  area: row.areaName,
  channel: row.channelName,
  received: row.receivedCount,
  categories: Object.keys(row.categories).join(' / '),
})))
console.log('Pagination returns the same project IDs:', experiments.pagination.sameProjects)
console.log('filter=东方 returns the same project IDs as filter=:', experiments.filter.sameProjects)
