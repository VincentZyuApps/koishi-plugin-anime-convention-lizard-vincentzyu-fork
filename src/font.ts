import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Context } from 'koishi'
import { FONT_MODE, type Config } from './config'

const nodeRequire = createRequire(__filename)
const fontkit = nodeRequire('fontkit') as { openSync: (filePath: string) => any }
const LXGW_RELEASE_FILE_NAME = 'LXGWWenKaiMono-Regular.ttf'
const RELEASE_SHA256 = 'ee9faa6479c5b2434f9bceca8e2e7b643f699f4f3d067aac9609261e07c6be61'
const FONT_EXTENSIONS = new Set(['.ttf', '.otf', '.woff', '.woff2'])
const RELEASE_SOURCES = [
  { name: 'Gitee', url: `https://gitee.com/vincent-zyu/koishi-plugin-awa-quote-image/releases/download/fonts/${LXGW_RELEASE_FILE_NAME}` },
  { name: 'GitHub', url: `https://github.com/VincentZyuApps/koishi-plugin-awa-quote-image/releases/download/fonts/${LXGW_RELEASE_FILE_NAME}` },
]

export interface RenderFontConfig {
  css: string
  family: string
  source: string
  emojiFallbackCodePoints: number[]
  systemFallbackCodePoints: number[]
}

export interface FontFailureDiagnostic {
  mode: Config['fontMode']
  family?: string
  source?: string
  missingCharacters?: string[]
}

export class FontConfigurationError extends Error {
  readonly diagnostic: FontFailureDiagnostic

  constructor(message: string, diagnostic: FontFailureDiagnostic) {
    super(message)
    this.name = 'FontConfigurationError'
    this.diagnostic = diagnostic
  }
}

interface FontFaceEntry {
  css: string
  filePath: string
}

const npmCssCache = new Map<string, RenderFontConfig>()
const releaseFontCache = new Map<string, Promise<string>>()
const parsedFontCache = new Map<string, any>()

function getFontFormat(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()
  if (!FONT_EXTENSIONS.has(extension)) {
    throw new FontConfigurationError(`不支持的字体格式：${extension || '无扩展名'}，仅支持 .ttf、.otf、.woff、.woff2。`, {
      mode: FONT_MODE.CUSTOM_PATH,
      source: filePath,
    })
  }
  return extension.slice(1)
}

function getFontMimeType(filePath: string) {
  switch (path.extname(filePath).toLowerCase()) {
    case '.otf': return 'font/otf'
    case '.woff2': return 'font/woff2'
    case '.woff': return 'font/woff'
    default: return 'font/ttf'
  }
}

function getFontCacheKey(filePath: string) {
  const stat = statSync(filePath)
  return `${filePath}|${stat.size}|${stat.mtimeMs}`
}

function getParsedFont(filePath: string) {
  const cacheKey = getFontCacheKey(filePath)
  const cached = parsedFontCache.get(cacheKey)
  if (cached) return cached

  const opened = fontkit.openSync(filePath)
  const font = Array.isArray(opened.fonts) ? opened.fonts[0] : opened
  if (!font?.hasGlyphForCodePoint) throw new Error('字体文件无法提供字形覆盖信息。')
  parsedFontCache.set(cacheKey, font)
  return font
}

function hasGlyph(filePath: string, codePoint: number) {
  return !!getParsedFont(filePath).hasGlyphForCodePoint(codePoint)
}

function rangeIncludesCharacter(range: string, codePoint: number) {
  return range.split(',').some((item) => {
    const [start, end = start] = item.trim().replace(/^U\+/i, '').split('-')
    const from = Number.parseInt(start, 16)
    const to = Number.parseInt(end, 16)
    return codePoint >= from && codePoint <= to
  })
}

function isIgnorableCodePoint(codePoint: number) {
  return /\s/u.test(String.fromCodePoint(codePoint))
    || codePoint === 0x200d
    || (codePoint >= 0xfe00 && codePoint <= 0xfe0f)
}

function isEmojiCodePoint(codePoint: number) {
  return /\p{Extended_Pictographic}/u.test(String.fromCodePoint(codePoint))
}

function formatCodePoint(codePoint: number) {
  return `${String.fromCodePoint(codePoint)} (U+${codePoint.toString(16).toUpperCase()})`
}

function createFallbackPlan(config: Config, content: string, supports: (codePoint: number) => boolean, diagnostic: Omit<FontFailureDiagnostic, 'missingCharacters' | 'mode'>) {
  const emojiFallbackCodePoints = new Set<number>()
  const systemFallbackCodePoints = new Set<number>()
  const missingCodePoints: number[] = []

  for (const character of new Set(Array.from(content))) {
    const codePoint = character.codePointAt(0)!
    if (isIgnorableCodePoint(codePoint) || supports(codePoint)) continue

    if (isEmojiCodePoint(codePoint) && config.allowEmojiFontFallback) {
      emojiFallbackCodePoints.add(codePoint)
    } else if (config.allowSystemFontFallback) {
      systemFallbackCodePoints.add(codePoint)
    } else {
      missingCodePoints.push(codePoint)
    }
  }

  if (missingCodePoints.length) {
    const missingCharacters = missingCodePoints.map(formatCodePoint)
    throw new FontConfigurationError(
      `所选字体模式「${config.fontMode}」缺少字符：${missingCharacters.slice(0, 12).join('、')}${missingCharacters.length > 12 ? ' 等' : ''}。` +
      '请更换字体模式、指定覆盖这些字符的字体，或按需开启实验性补字开关。',
      { ...diagnostic, mode: config.fontMode, missingCharacters },
    )
  }

  return {
    emojiFallbackCodePoints: [...emojiFallbackCodePoints],
    systemFallbackCodePoints: [...systemFallbackCodePoints],
  }
}

function createRenderFontConfig(
  config: Config,
  content: string,
  css: string,
  family: string,
  source: string,
  supports: (codePoint: number) => boolean,
): RenderFontConfig {
  const fallbacks = createFallbackPlan(config, content, supports, { family, source })
  return {
    css,
    family,
    source,
    ...fallbacks,
  }
}

function createEmbeddedFontConfig(config: Config, content: string, filePath: string, family: string): RenderFontConfig {
  const format = getFontFormat(filePath)
  const font = readFileSync(filePath)
  return createRenderFontConfig(
    config,
    content,
    `@font-face { font-family: '${family}'; src: url('data:${getFontMimeType(filePath)};base64,${font.toString('base64')}') format('${format}'); font-weight: normal; font-style: normal; font-display: block; }`,
    family,
    filePath,
    codePoint => hasGlyph(filePath, codePoint),
  )
}

function createReleaseFontConfig(config: Config, content: string, filePath: string): RenderFontConfig {
  const family = 'LXGW WenKai Mono'
  return createRenderFontConfig(
    config,
    content,
    `@font-face { font-family: '${family}'; src: url('${pathToFileURL(filePath).href}') format('truetype'); font-weight: normal; font-style: normal; font-display: block; }`,
    family,
    filePath,
    codePoint => hasGlyph(filePath, codePoint),
  )
}

function loadNpmLxgwFont(config: Config, content: string): RenderFontConfig {
  const cssPath = nodeRequire.resolve('@chinese-fonts/lxgwwenkai/dist/LXGWWenKai-Regular/result.css')
  const cssDirectory = path.dirname(cssPath)
  const allFaces = readFileSync(cssPath, 'utf8').match(/@font-face\{[^}]+\}/g) || []
  const codePoints = new Set(Array.from(content).map(character => character.codePointAt(0)!))
  const selectedFaces = allFaces.filter((face) => {
    const unicodeRange = face.match(/unicode-range:([^;]+);/)?.[1]
    return unicodeRange && [...codePoints].some(codePoint => rangeIncludesCharacter(unicodeRange, codePoint))
  })
  if (!selectedFaces.length) {
    throw new FontConfigurationError('内置 npm 霞鹜文楷未匹配到当前页面所需字形。', {
      mode: config.fontMode,
      family: 'LXGW WenKai',
      source: cssPath,
    })
  }

  const faces: FontFaceEntry[] = selectedFaces.map((face) => {
    const relativePath = face.match(/url\((['"]?)(\.\/[^)'\"]+)\1\)/)?.[2]
    if (!relativePath) throw new FontConfigurationError('内置 npm 霞鹜文楷的字体文件路径无效。', {
      mode: config.fontMode,
      family: 'LXGW WenKai',
      source: cssPath,
    })
    return { css: face, filePath: path.resolve(cssDirectory, relativePath) }
  })
  const cacheKey = `${cssPath}|${content}|${config.allowEmojiFontFallback}|${config.allowSystemFontFallback}`
  const cached = npmCssCache.get(cacheKey)
  if (cached) return cached

  const css = faces.map(({ css, filePath }) => css
    .replace(/local\("LXGW WenKai"\),/g, '')
    .replace(/font-display:swap/g, 'font-display:block')
    .replace(/url\((['"]?)(\.\/[^)'\"]+)\1\)/g, () => `url('data:font/woff2;base64,${readFileSync(filePath).toString('base64')}')`))
    .join('\n')
  const result = createRenderFontConfig(
    config,
    content,
    css,
    'LXGW WenKai',
    cssPath,
    codePoint => faces.some(face => hasGlyph(face.filePath, codePoint)),
  )
  npmCssCache.set(cacheKey, result)
  return result
}

function getReleaseFontPath(ctx: Context) {
  return path.join(ctx.baseDir, 'data', 'fonts', LXGW_RELEASE_FILE_NAME)
}

function verifyReleaseFont(font: Buffer) {
  return createHash('sha256').update(font).digest('hex') === RELEASE_SHA256
}

async function ensureReleaseFont(ctx: Context) {
  const target = getReleaseFontPath(ctx)
  const cached = releaseFontCache.get(target)
  if (cached) return cached

  const task = (async () => {
    if (existsSync(target) && verifyReleaseFont(await readFile(target))) return target
    if (existsSync(target)) ctx.logger.warn(`[漫展] Release 字体文件校验失败，将重新下载：${target}`)

    await mkdir(path.dirname(target), { recursive: true })
    let lastError: unknown
    for (const source of RELEASE_SOURCES) {
      const temporary = `${target}.${process.pid}.${Math.random().toString(16).slice(2)}.part`
      try {
        ctx.logger.info(`[漫展] 下载字体 ${LXGW_RELEASE_FILE_NAME}（${source.name}）`)
        const response = await ctx.http.get(source.url, { responseType: 'arraybuffer', timeout: 60_000 })
        const font = Buffer.from(response)
        if (!verifyReleaseFont(font)) throw new Error('SHA-256 校验失败')
        await writeFile(temporary, font)
        await unlink(target).catch(() => {})
        await rename(temporary, target)
        ctx.logger.info(`[漫展] 字体下载完成并通过 SHA-256 校验（${source.name}）`)
        return target
      } catch (error) {
        lastError = error
        await unlink(temporary).catch(() => {})
        ctx.logger.warn(`[漫展] ${source.name} 字体下载失败：${error instanceof Error ? error.message : error}`)
      }
    }
    throw new FontConfigurationError(`Release 字体下载失败，Gitee 与 GitHub 均不可用：${lastError instanceof Error ? lastError.message : lastError}`, {
      mode: FONT_MODE.RELEASE_LXGW,
      family: 'LXGW WenKai Mono',
      source: target,
    })
  })()

  releaseFontCache.set(target, task)
  try {
    return await task
  } catch (error) {
    releaseFontCache.delete(target)
    throw error
  }
}

export async function resolveRenderFont(ctx: Context, config: Config, content: string): Promise<RenderFontConfig | null> {
  try {
    switch (config.fontMode) {
      case FONT_MODE.SYSTEM_DEFAULT:
        return null
      case FONT_MODE.NPM_LXGW:
        return loadNpmLxgwFont(config, content)
      case FONT_MODE.RELEASE_LXGW:
        return createReleaseFontConfig(config, content, await ensureReleaseFont(ctx))
      case FONT_MODE.CUSTOM_PATH: {
        const fontPath = config.customFontPath.trim()
        if (!fontPath) throw new FontConfigurationError('已选择「指定字体绝对路径」，但未填写字体文件路径。', { mode: config.fontMode })
        if (!path.isAbsolute(fontPath)) throw new FontConfigurationError(`自定义字体路径必须为绝对路径：${fontPath}`, { mode: config.fontMode, source: fontPath })
        if (!existsSync(fontPath)) throw new FontConfigurationError(`自定义字体文件不存在：${fontPath}`, { mode: config.fontMode, source: fontPath })
        return createEmbeddedFontConfig(config, content, fontPath, 'AnimeConventionCustomFont')
      }
      default:
        throw new FontConfigurationError(`未知字体模式：${config.fontMode}`, { mode: config.fontMode })
    }
  } catch (error) {
    if (error instanceof FontConfigurationError) throw error
    throw new FontConfigurationError(`无法读取所选字体模式「${config.fontMode}」：${error instanceof Error ? error.message : error}`, {
      mode: config.fontMode,
    })
  }
}
