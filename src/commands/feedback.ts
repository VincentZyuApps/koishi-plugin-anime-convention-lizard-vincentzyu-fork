import { Context, h, Session } from 'koishi'
import type { Config } from '../config'
import { FontConfigurationError } from '../font'

export function quote(session: Session, config: Config) {
  return config.addQuote ? h.quote(session.messageId) : ''
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function getVerboseDiagnostic(config: Config, error: unknown) {
  const lines = [
    '调试诊断：',
    `fontMode=${config.fontMode}`,
    `allowEmojiFontFallback=${config.allowEmojiFontFallback}`,
    `allowSystemFontFallback=${config.allowSystemFontFallback}`,
    `imageType=${config.imageType}`,
    `imageDisplayMode=${config.imageDisplayMode}`,
    `error=${getErrorMessage(error)}`,
  ]
  if (error instanceof FontConfigurationError) {
    const { diagnostic } = error
    if (diagnostic.family) lines.push(`fontFamily=${diagnostic.family}`)
    if (diagnostic.source) lines.push(`fontSource=${diagnostic.source}`)
    if (diagnostic.missingCharacters?.length) lines.push(`missingCharacters=${diagnostic.missingCharacters.join('、')}`)
  }
  return lines.join('\n')
}

export async function sendImageFailure(
  ctx: Context,
  session: Session,
  config: Config,
  source: '漫展' | '漫展B',
  error: unknown,
) {
  ctx.logger.error(`[${source}] 图片渲染失败:`, error)
  const diagnostic = getVerboseDiagnostic(config, error)
  if (config.verboseConsoleLog) ctx.logger.info(`[${source}] ${diagnostic.replace(/\n/g, ' | ')}`)
  const message = [
    `图片渲染失败：${getErrorMessage(error)}`,
    `当前字体模式：${config.fontMode}。请管理员检查所选模式的字体来源，或调整字体路径与实验性补字开关。`,
    config.verboseSessionLog ? diagnostic : '',
  ].filter(Boolean).join('\n\n')
  await session.send(`${quote(session, config)}${message}`)
}
