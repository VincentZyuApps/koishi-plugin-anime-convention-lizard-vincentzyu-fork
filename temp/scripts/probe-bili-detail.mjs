import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { compactProject, extractProjects, getProjectDetail, listProjects } from './bili-client.mjs'

const outputPath = resolve(import.meta.dirname, '../docs/bili-detail-probe.json')
const listResult = await listProjects({ area: '110000', pType: '展览' })
const project = extractProjects(listResult)[0]

if (!project) throw new Error('No Beijing exhibition project was returned; cannot probe detail endpoint.')

const detailResult = await getProjectDetail(project.project_id)
const detail = detailResult.json.data || {}
const listGuests = project.guests || []
const detailGuests = detail.guests || []

const report = {
  generatedAt: new Date().toISOString(),
  project: compactProject(project),
  listEndpoint: {
    guestCount: listGuests.length,
    guestNames: listGuests.map((guest) => guest.name),
  },
  detailEndpoint: {
    httpStatus: detailResult.status,
    code: detailResult.json.code ?? detailResult.json.errno,
    message: detailResult.json.message ?? detailResult.json.msg,
    keys: Object.keys(detail).sort(),
    guestCount: detailGuests.length,
    guests: detailGuests.slice(0, 10).map((guest) => ({
      id: guest.id ?? guest.guest_id,
      name: guest.name,
      description: guest.description,
      booked: guest.book_num,
      image: guest.guest_img,
    })),
  },
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')

console.log(`Wrote ${outputPath}`)
console.log(`Project: ${project.project_name}`)
console.log(`List guest names: ${JSON.stringify(report.listEndpoint.guestNames)}`)
console.log(`Detail guests: ${report.detailEndpoint.guestCount}`)
