import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { existsSync, readFileSync } from 'fs'
import { extname, isAbsolute, resolve } from 'path'

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 1000

async function getPageWithRetry(ctx: Context) {
  let lastError: Error | null = null
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const puppeteer = ctx.puppeteer as any
      if (!puppeteer.browser?.connected) {
        ctx.logger.warn(`Browser not connected, attempt ${attempt}/${MAX_RETRIES}`)
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        continue
      }
      return await ctx.puppeteer.page()
    } catch (error) {
      lastError = error as Error
      ctx.logger.warn(`Page creation failed (attempt ${attempt}/${MAX_RETRIES}): ${error}`)
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
  }
  
  throw lastError || new Error('Failed to create page after retries')
}

export interface EventData {
  name: string
  location: string
  address: string
  time: string
  tag: string
  ended: string
  wannaGoCount: string | number
  circleCount: string | number
  doujinshiCount: string | number
  url: string
  isOnline: string | boolean
  appLogoPicUrl: string
  keyword?: string  // 一键查询时携带的订阅关键词
}

/**
 * 配色方案 (参考无差别同人站 https://www.allcpp.cn 风格，橙黄主色调)
 */
function getColors(isDarkMode: boolean) {
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

const BASE_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif'
const CUSTOM_FONT_FAMILY = 'KoishiCustomFont'

type CustomFontConfig = {
  css: string
  familyPrefix: string
}

function getFontFormat(ext: string) {
  if (ext === '.otf') return 'opentype'
  if (ext === '.woff2') return 'woff2'
  if (ext === '.woff') return 'woff'
  return 'truetype'
}

function getFontMimeType(ext: string) {
  if (ext === '.otf') return 'font/otf'
  if (ext === '.woff2') return 'font/woff2'
  if (ext === '.woff') return 'font/woff'
  return 'font/ttf'
}

function buildCustomFontConfig(ctx: Context, fontPath?: string | null): CustomFontConfig | null {
  if (!fontPath) return null
  const resolvedPath = isAbsolute(fontPath) ? fontPath : resolve(fontPath)
  if (!existsSync(resolvedPath)) {
    ctx.logger.warn(`自定义字体不存在: ${resolvedPath}`)
    return null
  }

  try {
    const buffer = readFileSync(resolvedPath)
    const ext = extname(resolvedPath).toLowerCase()
    const format = getFontFormat(ext)
    const mime = getFontMimeType(ext)
    const css = `@font-face {
  font-family: '${CUSTOM_FONT_FAMILY}';
  src: url('data:${mime};base64,${buffer.toString('base64')}') format('${format}');
  font-weight: normal;
  font-style: normal;
}
`
    return {
      css,
      familyPrefix: `'${CUSTOM_FONT_FAMILY}', `,
    }
  } catch (error) {
    ctx.logger.warn(`加载自定义字体失败: ${resolvedPath} ${error}`)
    return null
  }
}

/**
 * 获取图片的 base64 编码
 */
async function fetchImageAsBase64(url: string): Promise<string | null> {
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    return buffer.toString('base64')
  } catch {
    return null
  }
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
  customFont: CustomFontConfig | null,
  containerWidth: number = 800,
  viewportWidth: number = 900
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
  const fontFamily = `${customFont?.familyPrefix ?? ''}${BASE_FONT_STACK}`

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
      <span class="footer-source">数据来源：https://www.allcpp.cn 无差别同人站</span>
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
  customFontPath?: string | null
): Promise<string> {
  const browserPage = await getPageWithRetry(ctx)
  const colors = getColors(enableDarkMode)
  const customFont = buildCustomFontConfig(ctx, customFontPath ?? null)
  
  try {
    // 并行获取所有图片
    let logoBase64List: (string | null)[] = []
    if (imageDisplayMode !== 'none') {
      logoBase64List = await Promise.all(
        events.map(event => fetchImageAsBase64(event.appLogoPicUrl))
      )
    }
    
    // 生成带图片的卡片 HTML
    const eventsHtml = events.map((event, i) => 
      generateEventCardHtml(event, i + 1, colors, logoBase64List[i] || null, imageDisplayMode)
    ).join('')
    
    // 生成 HTML
    const htmlContent = generateHtml(title, events, colors, eventsHtml, enableDarkMode, customFont, containerWidth, viewportWidth)
    
    // 设置视口
    await browserPage.setViewport({
      width: viewportWidth,
      height: 800,
      deviceScaleFactor: 1.5,  // 提高清晰度
    })
    
    // 设置内容
    await browserPage.setContent(htmlContent)
    
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
    ctx.logger.error(`Failed to render events image: ${error}`)
    throw error
  } finally {
    await browserPage.close()
  }
}

/**
 * 生成单个漫展详情的 HTML (简洁扁平风格)
 */
function generateDetailHtml(
  event: EventData,
  logoBase64: string | null,
  colors: ReturnType<typeof getColors>,
  isDarkMode: boolean,
  customFont: CustomFontConfig | null,
  containerWidth: number = 600,
  viewportWidth: number = 700
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

  const fontFaceCss = customFont?.css ?? ''
  const fontFamily = `${customFont?.familyPrefix ?? ''}${BASE_FONT_STACK}`

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
      <span class="footer-source">数据来源：https://www.allcpp.cn 无差别同人站</span>
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
  customFontPath?: string | null
): Promise<string> {
  const browserPage = await getPageWithRetry(ctx)
  const viewportWidth = 700
  const colors = getColors(enableDarkMode)
  const customFont = buildCustomFontConfig(ctx, customFontPath ?? null)
  
  try {
    // 获取封面图片的 base64
    const logoBase64 = await fetchImageAsBase64(event.appLogoPicUrl)
    const htmlContent = generateDetailHtml(event, logoBase64, colors, enableDarkMode, customFont, 600, viewportWidth)
    
    await browserPage.setViewport({
      width: viewportWidth,
      height: 800,
      deviceScaleFactor: 1.5,
    })
    
    await browserPage.setContent(htmlContent)
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
    ctx.logger.error(`Failed to render event detail image: ${error}`)
    throw error
  } finally {
    await browserPage.close()
  }
}
