import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { type Config } from '../config'
import { FontConfigurationError, type RenderFontConfig, resolveRenderFont } from '../font'
import { fetchImageAsBase64, getPageWithRetry, isRecoverablePuppeteerError, mapWithConcurrency } from './shared'
import { EventData, RenderSource } from './types'

/**
 * 配色方案 (参考无差别同人站 https://www.allcpp.cn 风格，橙黄主色调)
 */
function getColors(isDarkMode: boolean, source: RenderSource = 'allcpp') {
  if (source === 'bilibili') {
    return isDarkMode ? {
      background: '#15171d',
      cardBackground: '#20232c',
      textPrimary: '#f5f7fb',
      textSecondary: '#a9b3c4',
      primary: '#00a1d6',
      secondary: '#ff5687',
      accent: '#ff7ca3',
      border: '#363c4b',
      hover: '#292d38',
      ongoing: '#00a1d6',
      ended: '#687386',
      upcoming: '#ff5687',
      link: '#00a1d6',
      statBg: 'rgba(0, 161, 214, 0.16)'
    } : {
      background: '#f6f8fb',
      cardBackground: '#ffffff',
      textPrimary: '#252a34',
      textSecondary: '#737b8d',
      primary: '#00a1d6',
      secondary: '#ff5687',
      accent: '#ff5687',
      border: '#dfe5ee',
      hover: '#f3f7fb',
      ongoing: '#00a1d6',
      ended: '#b0b8c5',
      upcoming: '#ff5687',
      link: '#00a1d6',
      statBg: 'rgba(0, 161, 214, 0.08)'
    }
  }

  return isDarkMode ? {
    // 深色模式配色
    background: '#1a1a1a',
    cardBackground: '#252525',
    textPrimary: '#ffffff',
    textSecondary: '#a0a0a0',
    primary: '#f5a623',      // 橙黄色 (主色调)
    secondary: '#e8a000',    // 深橙黄
    accent: '#667eea',       // 紫色强调
    border: '#3a3a3a',
    hover: '#303030',
    ongoing: '#f5a623',      // 进行中 - 橙黄
    ended: '#666666',        // 已结束 - 灰色
    upcoming: '#4ecdc4',     // 未开始 - 青色
    link: '#f5a623',
    statBg: 'rgba(245, 166, 35, 0.15)'
  } : {
    // 亮色模式配色 (参考无差别同人站)
    background: '#f8f9fa',
    cardBackground: '#ffffff',
    textPrimary: '#333333',
    textSecondary: '#888888',
    primary: '#f5a623',      // 橙黄色 (主色调)
    secondary: '#e8a000',    // 深橙黄
    accent: '#667eea',       // 紫色强调
    border: '#eaeaea',
    hover: '#fafafa',
    ongoing: '#f5a623',      // 进行中 - 橙黄
    ended: '#cccccc',        // 已结束 - 灰色
    upcoming: '#4ecdc4',     // 未开始 - 青色
    link: '#f5a623',
    statBg: 'rgba(245, 166, 35, 0.08)'
  }
}

const FONT_READY_TIMEOUT = 10_000
const STATIC_RENDER_TEXT = '漫展查询结果 漫展详情 详细信息 共计 进行中 未开始 已结束 地点 地址 时间 标签 想去 社团 同人作 B站会员购 无差别同人站 查询结果 活动状态 数据来源 线上 线下 封面 🎉 📍 📮 📅 🏷️ ❤️ 🏠 📚 🔖 ℹ️'
const SYSTEM_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'
const EMOJI_FONT_STACK = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'

async function applyFontFallbackSpans(browserPage: any, customFont: RenderFontConfig | null) {
  if (!customFont || (!customFont.emojiFallbackCodePoints.length && !customFont.systemFallbackCodePoints.length)) return

  await browserPage.evaluate(({ emojiCodePoints, systemCodePoints }) => {
    const emoji = new Set<number>(emojiCodePoints)
    const system = new Set<number>(systemCodePoints)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)

    const Segmenter = (Intl as any).Segmenter
    const segmenter = Segmenter ? new Segmenter('zh-CN', { granularity: 'grapheme' }) : null
    for (const node of nodes) {
      const value = node.nodeValue || ''
      const segments = segmenter ? Array.from(segmenter.segment(value), (item: any) => item.segment) : Array.from(value)
      if (!segments.some((segment: string) => Array.from(segment).some(character => {
        const codePoint = character.codePointAt(0)!
        return emoji.has(codePoint) || system.has(codePoint)
      }))) continue

      const fragment = document.createDocumentFragment()
      for (const segment of segments as string[]) {
        const codePoints = Array.from(segment, character => character.codePointAt(0)!)
        const className = codePoints.some(codePoint => system.has(codePoint))
          ? 'system-font-fallback'
          : codePoints.some(codePoint => emoji.has(codePoint))
            ? 'emoji-font-fallback'
            : ''
        if (!className) {
          fragment.append(document.createTextNode(segment))
          continue
        }
        const wrapper = document.createElement('span')
        wrapper.className = className
        wrapper.textContent = segment
        fragment.append(wrapper)
      }
      node.parentNode?.replaceChild(fragment, node)
    }
  }, {
    emojiCodePoints: customFont.emojiFallbackCodePoints,
    systemCodePoints: customFont.systemFallbackCodePoints,
  })
}

async function waitForRenderFonts(
  ctx: Context,
  config: Config,
  browserPage: any,
  customFont: RenderFontConfig | null,
) {
  const expectedFamily = customFont?.family || ''
  const diagnostics = await browserPage.evaluate(async ({ expectedFamily, timeout }) => {
    const fontSet = document.fonts
    let timedOut = false

    if (expectedFamily) {
      await Promise.race([
        fontSet.ready,
        new Promise<void>((resolve) => window.setTimeout(() => {
          timedOut = true
          resolve()
        }, timeout)),
      ])
    }

    const bodyStyle = window.getComputedStyle(document.body)
    return {
      timedOut,
      status: fontSet.status,
      faceCount: fontSet.size,
      loadedExpectedFaces: expectedFamily
        ? Array.from(fontSet).filter(face => face.family.replace(/["']/g, '') === expectedFamily && face.status === 'loaded').length
        : 0,
      failedExpectedFaces: expectedFamily
        ? Array.from(fontSet).filter(face => face.family.replace(/["']/g, '') === expectedFamily && face.status === 'error').length
        : 0,
      computedFontFamily: bodyStyle.fontFamily,
    }
  }, { expectedFamily, timeout: FONT_READY_TIMEOUT })

  const injectedFaceCount = (customFont?.css.match(/@font-face/g) || []).length
  if (config.verboseConsoleLog) {
    ctx.logger.info(
      `[漫展] 字体渲染诊断 mode=${config.fontMode} family=${expectedFamily || 'system-default'} ` +
      `source=${customFont?.source || 'system-default'} injectedFaces=${injectedFaceCount} ` +
      `loadedExpectedFaces=${diagnostics.loadedExpectedFaces} failedExpectedFaces=${diagnostics.failedExpectedFaces} ` +
      `emojiFallback=${customFont?.emojiFallbackCodePoints.length || 0} systemFallback=${customFont?.systemFallbackCodePoints.length || 0} ` +
      `ready=${!diagnostics.timedOut} status=${diagnostics.status} computed=${diagnostics.computedFontFamily}`,
    )
  }

  if (expectedFamily && (diagnostics.timedOut || !injectedFaceCount || !diagnostics.loadedExpectedFaces || diagnostics.failedExpectedFaces)) {
    throw new FontConfigurationError(`所选字体「${expectedFamily}」未能在 ${FONT_READY_TIMEOUT / 1000} 秒内完成加载。`, {
      mode: config.fontMode,
      family: expectedFamily,
      source: customFont?.source,
    })
  }
}

function getSourceLabel(source: RenderSource) {
  return source === 'bilibili'
    ? '数据来源：B站会员购'
    : '数据来源：https://www.allcpp.cn 无差别同人站'
}

/**
 * 生成单个漫展卡片的 HTML (简洁扁平风格)
 */
function generateEventCardHtml(
  event: EventData, 
  index: number, 
  colors: ReturnType<typeof getColors>,
  logoBase64: string | null = null,
  imageDisplayMode: 'none' | 'compact' | 'gradient' | 'flip-horizontal' | 'full-blur-bg-text' = 'compact'
): string {
  const isOnlineText = typeof event.isOnline === 'string' 
    ? event.isOnline 
    : (event.isOnline ? '线上' : '线下')
  
  // 根据状态设置不同的样式
  let statusBadge = '进行中'
  let statusColor = colors.ongoing
  if (event.ended === '已结束') {
    statusBadge = '已结束'
    statusColor = colors.ended
  } else if (event.ended === '未开始') {
    statusBadge = '未开始'
    statusColor = colors.upcoming
  }

  // 根据显示模式生成图片 HTML
  let logoHtml = ''
  let gradientBgHtml = ''
  let cardExtraClass = ''
  
  if (imageDisplayMode === 'none' || !logoBase64) {
    // 模式 1: 不展示图片
    logoHtml = ''
  } else if (imageDisplayMode === 'compact') {
    // 模式 2: 左侧展示 4:3 图片
    logoHtml = `<div class="event-logo"><img src="data:image/jpeg;base64,${logoBase64}" alt="封面" /></div>`
  } else if (imageDisplayMode === 'gradient' || imageDisplayMode === 'flip-horizontal' || imageDisplayMode === 'full-blur-bg-text') {
    // 模式 3~5: 渐变背景图
    const isFull = imageDisplayMode !== 'gradient'
    const imgHtml = `<img class="img-orig" src="data:image/jpeg;base64,${logoBase64}" alt="封面" />${isFull ? `<img class="img-mirror" src="data:image/jpeg;base64,${logoBase64}" alt="封面" />` : ''}`
    
    gradientBgHtml = `<div class="event-bg-gradient${isFull ? ' is-full' : ''}${imageDisplayMode === 'full-blur-bg-text' ? ' is-full-text' : ''}">
      <div class="bg-layer img-clear">${imgHtml}</div>
      <div class="bg-layer img-blur">${imgHtml}</div>
    </div>`
    cardExtraClass = ' has-gradient-bg'
    if (imageDisplayMode === 'full-blur-bg-text') {
      cardExtraClass += ' has-gradient-full-text'
    }
  }

  // 处理标签，分割成多个小标签（支持 | , ， 、 空格 分隔）
  const tags = event.tag ? event.tag.split(/[|,，、\s]+/).filter(t => t.trim()) : []
  const tagsHtml = tags.length > 0 
    ? tags.map(t => `<span class="tag-item">${t.trim()}</span>`).join('') 
    : '<span class="tag-empty">-</span>'

  return `
    <div class="event-card${cardExtraClass}" style="border-left-color: ${statusColor};">
      ${gradientBgHtml}
      <div class="event-main">
        ${logoHtml}
        <div class="event-content">
          <div class="event-header">
            <span class="event-index">${index}</span>
            <span class="status-badge" style="background: ${statusColor};">${statusBadge}</span>
            <span class="online-badge">${isOnlineText}</span>
            ${event.keyword ? `<span class="keyword-badge">🔖 ${event.keyword}</span>` : ''}
          </div>
          <div class="event-title">${event.name}</div>
          
          <div class="info-list">
            <div class="info-row">
              <span class="info-icon">📍</span>
              <span class="info-label">地点</span>
              <span class="info-value">${event.location || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-icon">📮</span>
              <span class="info-label">地址</span>
              <span class="info-value">${event.address || '-'}</span>
            </div>
            <div class="info-row">
              <span class="info-icon">📅</span>
              <span class="info-label">时间</span>
              <span class="info-value">${event.time || '-'}</span>
            </div>
            <div class="info-row tags-row">
              <span class="info-icon">🏷️</span>
              <span class="info-label">标签</span>
              <span class="info-value tags-container">${tagsHtml}</span>
            </div>
          </div>
          
          <div class="event-stats">
            <div class="stat-box">
              <span class="stat-num">${event.wannaGoCount || 0}</span>
              <span class="stat-text">❤️ 想去</span>
            </div>
            <div class="stat-box">
              <span class="stat-num">${event.circleCount || 0}</span>
              <span class="stat-text">🏠 社团</span>
            </div>
            <div class="stat-box">
              <span class="stat-num">${event.doujinshiCount || 0}</span>
              <span class="stat-text">📚 同人作</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
}

/**
 * 生成完整的 HTML 页面 (扁平化风格)
 */
function generateHtml(
  title: string,
  events: EventData[],
  colors: ReturnType<typeof getColors>,
  eventsHtml: string,
  isDarkMode: boolean,
  customFont: RenderFontConfig | null,
  containerWidth: number = 800,
  viewportWidth: number = 900,
  source: RenderSource = 'allcpp'
): string {
  const totalCount = events.length
  const ongoingCount = events.filter(e => e.ended !== '已结束' && e.ended !== '未开始').length
  const endedCount = events.filter(e => e.ended === '已结束').length
  const upcomingCount = events.filter(e => e.ended === '未开始').length
  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  const fontFaceCss = customFont?.css ?? ''
  const fontFamily = customFont ? `'${customFont.family}'` : SYSTEM_FONT_STACK

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${fontFaceCss}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${viewportWidth}px;
      background: ${colors.background};
      font-family: ${fontFamily};
      padding: 10px;
      color: ${colors.textPrimary};
    }

    .emoji-font-fallback {
      font-family: ${EMOJI_FONT_STACK};
    }

    .system-font-fallback {
      font-family: ${SYSTEM_FONT_STACK};
    }
    
    .main-container {
      max-width: ${containerWidth}px;
      margin: 0 auto;
      background: ${colors.cardBackground};
      border-radius: 10px;
      box-shadow: 0 1px 8px rgba(0,0,0,${isDarkMode ? '0.25' : '0.05'});
      overflow: hidden;
    }
    
    /* 头部样式 - 更清晰 */
    .header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      padding: 14px 16px;
      text-align: center;
    }
    
    .title {
      font-size: 28px;
      font-weight: 800;
      color: white;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
      text-shadow: 0 1px 1px ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)'};
    }
    
    .stats-row {
      display: flex;
      justify-content: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    
    .header-stat {
      background: rgba(255,255,255,0.95);
      border-radius: 6px;
      padding: 4px 10px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .header-stat-label {
      font-size: 15px;
      color: #666;
      font-weight: 600;
    }
    
    .header-stat-value {
      font-size: 20px;
      font-weight: 800;
      color: ${colors.primary};
      text-shadow: 0 1px 0 ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'};
    }
    
    /* 列表容器 */
    .events-container {
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }
    
    /* 卡片样式 - 简洁扁平 */
    .event-card {
      background: ${colors.cardBackground};
      border: 1px solid ${colors.border};
      border-left: 4px solid ${colors.primary};
      border-radius: 8px;
      padding: 8px;
      position: relative;
      overflow: hidden;
    }
    
    /* 渐变背景模式 - 图片占左侧60%，16:9比例 */
    .event-card.has-gradient-bg {
      padding: 0;
      min-height: 140px;
    }
    
    .event-bg-gradient {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 60%;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }
    
    .event-bg-gradient.is-full {
      width: 100%;
    }
    
    .bg-layer {
      position: absolute;
      inset: 0;
      display: flex;
    }
    
    .bg-layer img {
      height: 100%;
      object-fit: cover;
    }
    
    /* 模式3: 原始图片占满容器 */
    .event-bg-gradient:not(.is-full) .img-orig {
      width: 100%;
      object-position: left center;
    }
    
    /* 模式4: 左右拼接，右侧镜像 */
    .event-bg-gradient.is-full .img-orig {
      width: 50%;
      object-position: center;
    }
    
    .event-bg-gradient.is-full .img-mirror {
      width: 50%;
      transform: scaleX(-1);
      object-position: center;
    }
    
    /* 上层模糊图片，从左到右渐变显示 */
    .event-bg-gradient .img-blur {
      filter: blur(4px);
      -webkit-mask-image: linear-gradient(to right, transparent 0%, transparent 30%, black 70%, black 100%);
      mask-image: linear-gradient(to right, transparent 0%, transparent 30%, black 70%, black 100%);
    }
    
    /* 右侧渐变到背景色 - 模式3使用 */
    .event-bg-gradient:not(.is-full)::after {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(to right, 
        transparent 0%, 
        transparent 30%,
        ${colors.cardBackground}22 45%,
        ${colors.cardBackground}66 55%,
        ${colors.cardBackground}aa 70%,
        ${colors.cardBackground}dd 85%,
        ${colors.cardBackground} 100%
      );
      z-index: 1;
    }
    
    /* 模式4使用更淡的遮罩，主要靠 backdrop-filter */
    .event-bg-gradient.is-full::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(to right, 
        transparent 0%, 
        transparent 30%,
        ${isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.1)'} 100%
      );
      z-index: 1;
    }

    .event-bg-gradient.is-full-text {
      filter: blur(3px);
      opacity: 0.92;
    }

    .event-bg-gradient.is-full-text::after {
      background: linear-gradient(to right, 
        transparent 0%, 
        transparent 35%,
        ${isDarkMode ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.15)'} 100%
      );
    }
    
    .event-card.has-gradient-bg .event-main {
      position: relative;
      z-index: 1;
      margin-left: 38.2%;
      padding: 8px 12px;
      background: ${isDarkMode ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.1)'};
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }

    .event-card.has-gradient-full-text .event-main {
      margin-left: 0;
      padding: 12px 16px;
      width: 100%;
      background: ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.2)'};
    }
    
    /* 模式3文字增强 */
    .event-card.has-gradient-bg .event-title,
    .event-card.has-gradient-bg .info-label,
    .event-card.has-gradient-bg .info-value,
    .event-card.has-gradient-bg .stat-num,
    .event-card.has-gradient-bg .stat-text {
      text-shadow: 
        -1px -1px 0 ${colors.cardBackground},  
         1px -1px 0 ${colors.cardBackground},
        -1px  1px 0 ${colors.cardBackground},
         1px  1px 0 ${colors.cardBackground},
         0 1px 3px rgba(0,0,0,0.2);
    }

    .event-card.has-gradient-bg .stat-box {
      background: ${isDarkMode ? 'rgba(42,42,42,0.4)' : 'rgba(250,250,250,0.4)'};
    }

    .event-card.has-gradient-bg .info-row {
      border-bottom: 1px solid ${isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)'};
    }
    
    .event-main {
      display: flex;
      gap: 8px;
    }
    
    /* 紧凑模式图片 (4:3) */
    .event-logo {
      flex: 0 0 100px;
      height: 75px;
      border-radius: 5px;
      overflow: hidden;
    }
    
    .event-logo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .event-content {
      flex: 1;
      min-width: 0;
    }
    
    /* 头部徽章 */
    .event-header {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }
    
    .event-index {
      background: ${colors.primary};
      color: white;
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 13px;
    }
    
    .status-badge {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      font-weight: 700;
      color: white;
    }
    
    .online-badge {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      background: ${colors.accent};
      color: white;
      font-weight: 600;
    }
    
    .keyword-badge {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
      background: ${isDarkMode ? '#444' : '#f0f0f0'};
      color: ${colors.textPrimary};
      font-weight: 600;
    }
    
    /* 标题 */
    .event-title {
      font-size: 24px;
      font-weight: 800;
      color: ${colors.textPrimary};
      margin-bottom: 5px;
      line-height: 1.25;
      text-shadow: 0 1px 0 ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'};
    }
    
    /* 信息列表 - 更清晰 */
    .info-list {
      margin-bottom: 5px;
    }
    
    .info-row {
      display: flex;
      align-items: flex-start;
      padding: 3px 0;
      border-bottom: 1px dashed ${isDarkMode ? '#3a3a3a' : '#eee'};
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-icon {
      font-size: 17px;
      width: 20px;
      flex-shrink: 0;
    }
    
    .info-label {
      font-size: 17px;
      color: ${colors.textSecondary};
      width: 48px;
      flex-shrink: 0;
      font-weight: 600;
    }
    
    .info-value {
      font-size: 18px;
      color: ${colors.textPrimary};
      flex: 1;
      line-height: 1.25;
      word-break: break-all;
    }
    
    /* 标签样式 */
    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    
    .tag-item {
      font-size: 15px;
      padding: 1px 5px;
      background: ${isDarkMode ? '#3a3a3a' : '#fff3e0'};
      color: ${colors.primary};
      border-radius: 3px;
      border: 1px solid ${isDarkMode ? '#4a4a4a' : '#ffe0b2'};
    }
    
    .tag-empty {
      color: ${colors.textSecondary};
    }
    
    /* 统计数据 - 分隔模块 */
    .event-stats {
      display: flex;
      gap: 4px;
      margin-top: 0px;
    }
    
    .stat-box {
      flex: 1;
      text-align: center;
      padding: 4px 4px;
      background: ${isDarkMode ? '#2a2a2a' : '#fafafa'};
      border: 1px solid ${colors.border};
      border-radius: 5px;
    }
    
    .stat-num {
      display: inline;
      font-size: 20px;
      font-weight: 800;
      color: ${colors.primary};
      margin-right: 3px;
      text-shadow: 0 1px 0 ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'};
    }
    
    .stat-text {
      font-size: 13px;
      color: ${colors.textSecondary};
    }
    
    /* 底部 */
    .footer {
      padding: 10px 12px;
      text-align: center;
      border-top: 1px solid ${colors.border};
      background: ${isDarkMode ? '#1f1f1f' : '#fafafa'};
      display: flex;
      flex-direction: column;
      gap: 3px;
      align-items: center;
    }

    .footer-timestamp {
      font-size: 12px;
      font-weight: 600;
      color: ${colors.textSecondary};
    }

    .footer-source {
      font-size: 11px;
      color: ${isDarkMode ? '#d0d0d0' : '#666'};
    }

    .footer-plugin {
      font-size: 11px;
      color: ${colors.accent};
      font-weight: 600;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  <div class="main-container">
    <div class="header">
      <div class="title">🎉 ${title}</div>
      <div class="stats-row">
        <div class="header-stat">
          <span class="header-stat-label">共计</span>
          <span class="header-stat-value">${totalCount}</span>
        </div>
        <div class="header-stat">
          <span class="header-stat-label">进行中</span>
          <span class="header-stat-value">${ongoingCount}</span>
        </div>
        <div class="header-stat">
          <span class="header-stat-label">未开始</span>
          <span class="header-stat-value">${upcomingCount}</span>
        </div>
        <div class="header-stat">
          <span class="header-stat-label">已结束</span>
          <span class="header-stat-value">${endedCount}</span>
        </div>
      </div>
    </div>
    
    <div class="events-container">
      ${eventsHtml}
    </div>
    
    <div class="footer">
      <span class="footer-timestamp">${timestamp}</span>
      <span class="footer-source">${getSourceLabel(source)}</span>
      <span class="footer-plugin">generated by koishi-plugin-anime-convention-lizard-vincentzyu-fork</span>
    </div>
  </div>
</body>
</html>`
}

/**
 * 渲染漫展查询结果为图片
 */
export async function renderEventsImage(
  ctx: Context,
  title: string,
  events: EventData[],
  imageType: 'png' | 'jpeg' | 'webp' = 'png',
  screenshotQuality: number = 80,
  enableDarkMode: boolean = false,
  containerWidth: number = 800,
  viewportWidth: number = 900,
  imageDisplayMode: 'none' | 'compact' | 'gradient' | 'flip-horizontal' | 'full-blur-bg-text' = 'compact',
  config: Config,
  source: RenderSource = 'allcpp',
  retryAttempt = 0,
): Promise<string> {
  const colors = getColors(enableDarkMode, source)
  const fontContent = `${STATIC_RENDER_TEXT}\n${title}\n${JSON.stringify(events)}`
  const customFont = await resolveRenderFont(ctx, config, fontContent)
  const browserPage = await getPageWithRetry(ctx)
  let renderError: unknown
  
  try {
    // 并行获取所有图片
    let logoBase64List: (string | null)[] = []
    if (imageDisplayMode !== 'none') {
      logoBase64List = await mapWithConcurrency(
        events, 4, event => fetchImageAsBase64(event.appLogoPicUrl),
      )
    }
    
    // 生成带图片的卡片 HTML
    const eventsHtml = events.map((event, i) => 
      generateEventCardHtml(event, i + 1, colors, logoBase64List[i] || null, imageDisplayMode)
    ).join('')
    
    // 生成 HTML
    const htmlContent = generateHtml(title, events, colors, eventsHtml, enableDarkMode, customFont, containerWidth, viewportWidth, source)
    
    // 设置视口
    await browserPage.setViewport({
      width: viewportWidth,
      height: 800,
      deviceScaleFactor: 1.5,  // 提高清晰度
    })
    
    // 设置内容
    await browserPage.setContent(htmlContent)
    await applyFontFallbackSpans(browserPage, customFont)
    await waitForRenderFonts(ctx, config, browserPage, customFont)
    
    // 等待页面加载完成
    await browserPage.waitForSelector('body', { timeout: 10000 })
    
    // 获取实际内容高度
    const contentHeight = await browserPage.evaluate(() => {
      return document.documentElement.scrollHeight
    })
    
    // 重新设置视口以适应内容
    await browserPage.setViewport({
      width: viewportWidth,
      height: contentHeight,
      deviceScaleFactor: 1.5,
    })
    
    // 截图
    const screenshotOptions: any = {
      encoding: 'base64',
      type: imageType,
      fullPage: true,
    }
    
    // PNG不支持quality参数，只有jpeg和webp支持
    if (imageType !== 'png') {
      screenshotOptions.quality = screenshotQuality
    }
    
    const screenshot = await browserPage.screenshot(screenshotOptions)
    
    return screenshot as string
  } catch (error) {
    renderError = error
    if (config.verboseConsoleLog) ctx.logger.error(`Failed to render events image: ${error}`)
  } finally {
    try {
      await browserPage.close()
    } catch (error) {
      if (!renderError) throw error
      ctx.logger.warn(`Failed to close events image page after render error: ${error}`)
    }
  }

  if (isRecoverablePuppeteerError(renderError) && retryAttempt === 0) {
    ctx.logger.warn('Puppeteer 页面已关闭，等待共享浏览器重启后重试图片渲染。')
    await new Promise(resolve => setTimeout(resolve, 1000))
    return renderEventsImage(
      ctx, title, events, imageType, screenshotQuality, enableDarkMode,
      containerWidth, viewportWidth, imageDisplayMode, config, source, retryAttempt + 1,
    )
  }

  throw renderError
}

/**
 * 生成单个漫展详情的 HTML (简洁扁平风格)
 */
function generateDetailHtml(
  event: EventData,
  logoBase64: string | null,
  colors: ReturnType<typeof getColors>,
  isDarkMode: boolean,
  customFont: RenderFontConfig | null,
  containerWidth: number = 600,
  viewportWidth: number = 700,
  source: RenderSource = 'allcpp'
): string {
  const isOnlineText = typeof event.isOnline === 'string' 
    ? event.isOnline 
    : (event.isOnline ? '线上' : '线下')
  
  let statusBadge = '进行中'
  let statusColor = colors.ongoing
  if (event.ended === '已结束') {
    statusBadge = '已结束'
    statusColor = colors.ended
  } else if (event.ended === '未开始') {
    statusBadge = '未开始'
    statusColor = colors.upcoming
  }

  const timestamp = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  // 封面图片 HTML
  const logoHtml = logoBase64 
    ? `<div class="logo-section"><img src="data:image/jpeg;base64,${logoBase64}" alt="封面" /></div>`
    : ''

  // 处理标签（支持 | , ， 、 空格 分隔）
  const tags = event.tag ? event.tag.split(/[|,，、\s]+/).filter(t => t.trim()) : []
  const tagsHtml = tags.length > 0 
    ? tags.map(t => `<span class="tag-item">${t.trim()}</span>`).join('') 
    : `<span style="color:${colors.textSecondary}">-</span>`
  const extraDetailsHtml = (event.extraDetails || []).map((detail) => `
        <div class="info-row">
          <span class="info-icon">${detail.icon || 'ℹ️'}</span>
          <span class="info-label">${detail.label}</span>
          <span class="info-value">${detail.value || '-'}</span>
        </div>`).join('')

  const fontFaceCss = customFont?.css ?? ''
  const fontFamily = customFont ? `'${customFont.family}'` : SYSTEM_FONT_STACK

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    ${fontFaceCss}
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: ${viewportWidth}px;
      min-height: 100%;
      background: ${colors.background};
      font-family: ${fontFamily};
      color: ${colors.textPrimary};
    }
    
    body {
      padding: 10px;
    }

    .emoji-font-fallback {
      font-family: ${EMOJI_FONT_STACK};
    }

    .system-font-fallback {
      font-family: ${SYSTEM_FONT_STACK};
    }
    
    .main-container {
      max-width: ${containerWidth}px;
      margin: 0 auto;
      background: ${colors.cardBackground};
      border-radius: 10px;
      box-shadow: 0 1px 8px rgba(0,0,0,${isDarkMode ? '0.25' : '0.05'});
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%);
      padding: 12px 14px;
      text-align: center;
    }
    
    .page-title {
      font-size: 24px;
      font-weight: 800;
      color: white;
      margin-bottom: 3px;
      text-shadow: 0 1px 1px ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)'};
    }
    
    .page-subtitle {
      font-size: 12px;
      color: rgba(255,255,255,0.9);
    }
    
    .content {
      padding: 10px;
    }
    
    .logo-section {
      margin-bottom: 8px;
      border-radius: 7px;
      overflow: hidden;
    }
    
    .logo-section img {
      width: 100%;
      height: auto;
      display: block;
    }
    
    .badges {
      display: flex;
      align-items: center;
      gap: 3px;
      margin-bottom: 5px;
      flex-wrap: wrap;
    }
    
    .status-badge {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 700;
      color: white;
    }
    
    .online-badge {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: ${colors.accent};
      color: white;
      font-weight: 600;
    }
    
    .keyword-badge {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 4px;
      background: ${isDarkMode ? '#444' : '#f0f0f0'};
      color: ${colors.textPrimary};
      font-weight: 600;
    }
    
    .event-title {
      font-size: 21px;
      font-weight: 800;
      color: ${colors.textPrimary};
      margin-bottom: 8px;
      line-height: 1.25;
      padding-bottom: 6px;
      border-bottom: 1px dashed ${colors.border};
      text-shadow: 0 1px 0 ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'};
    }
    
    /* 信息列表 */
    .info-list {
      margin-bottom: 8px;
    }
    
    .info-row {
      display: flex;
      align-items: flex-start;
      padding: 4px 0;
      border-bottom: 1px dashed ${isDarkMode ? '#3a3a3a' : '#eee'};
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-icon {
      font-size: 17px;
      width: 22px;
      flex-shrink: 0;
    }
    
    .info-label {
      font-size: 17px;
      color: ${colors.textSecondary};
      width: 60px;
      flex-shrink: 0;
      font-weight: 600;
    }
    
    .info-value {
      font-size: 18px;
      color: ${colors.textPrimary};
      flex: 1;
      line-height: 1.25;
      word-break: break-all;
    }
    
    /* 标签 */
    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 2px;
    }
    
    .tag-item {
      font-size: 15px;
      padding: 1px 6px;
      background: ${isDarkMode ? '#3a3a3a' : '#fff3e0'};
      color: ${colors.primary};
      border-radius: 4px;
      border: 1px solid ${isDarkMode ? '#4a4a4a' : '#ffe0b2'};
    }
    
    /* 统计数据 */
    .stats-section {
      display: flex;
      gap: 5px;
      margin-bottom: 8px;
    }
    
    .stat-box {
      flex: 1;
      text-align: center;
      padding: 7px 6px;
      background: ${isDarkMode ? '#2a2a2a' : '#fafafa'};
      border: 1px solid ${colors.border};
      border-radius: 8px;
    }
    
    .stat-num {
      display: block;
      font-size: 28px;
      font-weight: 800;
      color: ${colors.primary};
      margin-bottom: 3px;
      text-shadow: 0 1px 0 ${isDarkMode ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.6)'};
    }
    
    .stat-text {
      font-size: 13px;
      color: ${colors.textSecondary};
    }
    
    .link-section {
      padding: 6px;
      background: ${isDarkMode ? '#2a2a2a' : '#fafafa'};
      border-radius: 6px;
      text-align: center;
    }
    
    .link-url {
      color: ${colors.primary};
      text-decoration: none;
      font-size: 12px;
      word-break: break-all;
    }
    
    .footer {
      padding: 8px 16px;
      text-align: center;
      border-top: 1px solid ${colors.border};
      background: ${isDarkMode ? '#1f1f1f' : '#fafafa'};
      display: flex;
      flex-direction: column;
      gap: 3px;
      align-items: center;
    }

    .footer-timestamp {
      font-size: 12px;
      font-weight: 600;
      color: ${colors.textSecondary};
    }

    .footer-source {
      font-size: 11px;
      color: ${isDarkMode ? '#d0d0d0' : '#666'};
    }

    .footer-plugin {
      font-size: 11px;
      color: ${colors.accent};
      font-weight: 600;
      letter-spacing: 0.5px;
    }
    
  </style>
</head>
<body>
  <div class="main-container">
    <div class="header">
      <div class="page-title">🎉 漫展详情</div>
      <div class="page-subtitle">详细信息</div>
    </div>
    
    <div class="content">
      ${logoHtml}
      
      <div class="badges">
        <span class="status-badge" style="background: ${statusColor};">${statusBadge}</span>
        <span class="online-badge">${isOnlineText}</span>
        ${event.keyword ? `<span class="keyword-badge">🔖 ${event.keyword}</span>` : ''}
      </div>
      
      <div class="event-title">${event.name}</div>
      
      <div class="info-list">
        <div class="info-row">
          <span class="info-icon">📍</span>
          <span class="info-label">地点</span>
          <span class="info-value">${event.location || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-icon">📮</span>
          <span class="info-label">地址</span>
          <span class="info-value">${event.address || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-icon">📅</span>
          <span class="info-label">时间</span>
          <span class="info-value">${event.time || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-icon">🏷️</span>
          <span class="info-label">标签</span>
          <span class="info-value tags-container">${tagsHtml}</span>
        </div>
        ${extraDetailsHtml}
      </div>
      
      <div class="stats-section">
        <div class="stat-box">
          <span class="stat-num">${event.wannaGoCount || 0}</span>
          <span class="stat-text">❤️ 想去</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">${event.circleCount || 0}</span>
          <span class="stat-text">🏠 社团</span>
        </div>
        <div class="stat-box">
          <span class="stat-num">${event.doujinshiCount || 0}</span>
          <span class="stat-text">📚 同人作</span>
        </div>
      </div>
      
      <div class="link-section">
        <a class="link-url" href="${event.url}">${event.url}</a>
      </div>
    </div>
    
    <div class="footer">
      <span class="footer-timestamp">${timestamp}</span>
      <span class="footer-source">${getSourceLabel(source)}</span>
      <span class="footer-plugin">generated by koishi-plugin-anime-convention-lizard-vincentzyu-fork</span>
    </div>
  </div>
</body>
</html>`
}

/**
 * 渲染单个漫展详情为图片
 */
export async function renderEventDetailImage(
  ctx: Context,
  event: EventData,
  imageType: 'png' | 'jpeg' | 'webp' = 'png',
  screenshotQuality: number = 80,
  enableDarkMode: boolean = false,
  config: Config,
  source: RenderSource = 'allcpp',
  retryAttempt = 0,
): Promise<string> {
  const viewportWidth = 700
  const colors = getColors(enableDarkMode, source)
  const fontContent = `${STATIC_RENDER_TEXT}\n${JSON.stringify(event)}`
  const customFont = await resolveRenderFont(ctx, config, fontContent)
  const browserPage = await getPageWithRetry(ctx)
  let renderError: unknown
  
  try {
    // 获取封面图片的 base64
    const logoBase64 = await fetchImageAsBase64(event.appLogoPicUrl)
    const htmlContent = generateDetailHtml(event, logoBase64, colors, enableDarkMode, customFont, 600, viewportWidth, source)
    
    await browserPage.setViewport({
      width: viewportWidth,
      height: 800,
      deviceScaleFactor: 1.5,
    })
    
    await browserPage.setContent(htmlContent)
    await applyFontFallbackSpans(browserPage, customFont)
    await waitForRenderFonts(ctx, config, browserPage, customFont)
    await browserPage.waitForSelector('body', { timeout: 10000 })
    
    const contentHeight = await browserPage.evaluate(() => {
      return document.documentElement.scrollHeight
    })
    
    await browserPage.setViewport({
      width: viewportWidth,
      height: contentHeight,
      deviceScaleFactor: 1.5,
    })
    
    const screenshotOptions: any = {
      encoding: 'base64',
      type: imageType,
      fullPage: true,
    }
    
    if (imageType !== 'png') {
      screenshotOptions.quality = screenshotQuality
    }
    
    const screenshot = await browserPage.screenshot(screenshotOptions)
    return screenshot as string
  } catch (error) {
    renderError = error
    if (config.verboseConsoleLog) ctx.logger.error(`Failed to render event detail image: ${error}`)
  } finally {
    try {
      await browserPage.close()
    } catch (error) {
      if (!renderError) throw error
      ctx.logger.warn(`Failed to close event detail image page after render error: ${error}`)
    }
  }

  if (isRecoverablePuppeteerError(renderError) && retryAttempt === 0) {
    ctx.logger.warn('Puppeteer 页面已关闭，等待共享浏览器重启后重试详情图片渲染。')
    await new Promise(resolve => setTimeout(resolve, 1000))
    return renderEventDetailImage(ctx, event, imageType, screenshotQuality, enableDarkMode, config, source, retryAttempt + 1)
  }

  throw renderError
}
