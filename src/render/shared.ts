import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000
const IMAGE_FETCH_TIMEOUT_MS = 8000
const MAX_EMBEDDED_IMAGE_BYTES = 1024 * 1024

export function isRecoverablePuppeteerError(error: unknown) {
  const message = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error)
  return /Target closed|Connection closed|Session closed|Browser.*disconnect|Execution context was destroyed/i.test(message)
}
export async function getPageWithRetry(ctx: Context) {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ctx.puppeteer.page()
    } catch (error) {
      lastError = error as Error
      ctx.logger.warn(`Page creation failed (attempt ${attempt}/${MAX_RETRIES}): ${error}`)
      if (attempt < MAX_RETRIES) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw lastError || new Error('创建 Puppeteer 页面失败，已重试三次。')
}

export async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > MAX_EMBEDDED_IMAGE_BYTES) return null
    const image = Buffer.from(await response.arrayBuffer())
    if (image.length > MAX_EMBEDDED_IMAGE_BYTES) return null
    return image.toString('base64')
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

export async function mapWithConcurrency<T, R>(items: T[], limit: number, callback: (item: T) => Promise<R>) {
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
