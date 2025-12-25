import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'

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
 * 生成单个漫展卡片的 HTML
 */
function generateEventCardHtml(event: EventData, index: number): string {
  const isOnlineText = typeof event.isOnline === 'string' 
    ? event.isOnline 
    : (event.isOnline ? '线上' : '线下')
  
  // 根据状态设置不同的样式
  let statusClass = 'ongoing'
  let statusBadge = '进行中'
  if (event.ended === '已结束') {
    statusClass = 'ended'
    statusBadge = '已结束'
  } else if (event.ended === '未开始') {
    statusClass = 'upcoming'
    statusBadge = '未开始'
  }

  return `
    <div class="event-card ${statusClass}">
      <div class="event-header">
        <span class="event-index">${index}</span>
        <span class="status-badge ${statusClass}">${statusBadge}</span>
        ${event.keyword ? `<span class="keyword-badge">🔖 ${event.keyword}</span>` : ''}
      </div>
      <div class="event-title">${event.name}</div>
      <div class="event-info">
        <div class="info-row">
          <span class="info-label">📍 地点</span>
          <span class="info-value">${event.location || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📮 地址</span>
          <span class="info-value">${event.address || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">📅 时间</span>
          <span class="info-value">${event.time || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🏷️ 标签</span>
          <span class="info-value">${event.tag || '-'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">🌐 方式</span>
          <span class="info-value">${isOnlineText}</span>
        </div>
      </div>
      <div class="event-stats">
        <div class="stat-item">
          <span class="stat-icon">❤️</span>
          <span class="stat-value">${event.wannaGoCount || 0}</span>
          <span class="stat-label">想去</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">🏠</span>
          <span class="stat-value">${event.circleCount || 0}</span>
          <span class="stat-label">社团</span>
        </div>
        <div class="stat-item">
          <span class="stat-icon">📚</span>
          <span class="stat-value">${event.doujinshiCount || 0}</span>
          <span class="stat-label">同人作</span>
        </div>
      </div>
      <div class="event-link">
        <a href="${event.url}">${event.url}</a>
      </div>
    </div>
  `
}

/**
 * 生成完整的 HTML 页面
 */
function generateHtml(
  title: string,
  events: EventData[],
  containerWidth: number = 800,
  viewportWidth: number = 900
): string {
  const eventsHtml = events.map((event, i) => generateEventCardHtml(event, i + 1)).join('')
  const totalCount = events.length
  const ongoingCount = events.filter(e => e.ended !== '已结束' && e.ended !== '未开始').length
  const endedCount = events.filter(e => e.ended === '已结束').length
  const upcomingCount = events.filter(e => e.ended === '未开始').length

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${viewportWidth}px;
      background: linear-gradient(135deg, #fff8e1 0%, #ffe0b2 50%, #ffcc80 100%);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "Microsoft YaHei", sans-serif;
      padding: 20px;
      color: #333;
    }
    
    .container {
      max-width: ${containerWidth}px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 25px;
      box-shadow: 0 8px 32px rgba(245, 166, 35, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
    
    .header {
      text-align: center;
      margin-bottom: 25px;
      padding-bottom: 20px;
      border-bottom: 2px dashed rgba(245, 166, 35, 0.3);
    }
    
    .title {
      font-size: 32px;
      font-weight: 700;
      background: linear-gradient(135deg, #f5a623 0%, #e8a000 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 15px;
    }
    
    .stats-row {
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .header-stat {
      background: linear-gradient(135deg, rgba(245, 166, 35, 0.15), rgba(232, 160, 0, 0.15));
      border-radius: 12px;
      padding: 10px 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .header-stat-label {
      font-size: 14px;
      color: #666;
    }
    
    .header-stat-value {
      font-size: 20px;
      font-weight: 700;
      color: #e8a000;
    }
    
    .events-container {
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .event-card {
      background: rgba(255, 255, 255, 0.9);
      border-radius: 16px;
      padding: 18px;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
      border-left: 4px solid #f5a623;
      transition: all 0.3s ease;
    }
    
    .event-card.ended {
      border-left-color: #aaa;
      opacity: 0.75;
    }
    
    .event-card.upcoming {
      border-left-color: #4ecdc4;
    }
    
    .event-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }
    
    .event-index {
      background: linear-gradient(135deg, #f5a623, #e8a000);
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
    }
    
    .status-badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 20px;
      font-weight: 600;
    }
    
    .status-badge.ongoing {
      background: linear-gradient(135deg, #f5a623, #e8a000);
      color: white;
    }
    
    .status-badge.ended {
      background: #e0e0e0;
      color: #666;
    }
    
    .status-badge.upcoming {
      background: linear-gradient(135deg, #4ecdc4, #44a08d);
      color: white;
    }
    
    .keyword-badge {
      font-size: 12px;
      padding: 4px 10px;
      border-radius: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      font-weight: 500;
    }
    
    .event-title {
      font-size: 18px;
      font-weight: 700;
      color: #333;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    
    .event-info {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 15px;
    }
    
    .info-row {
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    
    .info-label {
      font-size: 13px;
      color: #888;
      min-width: 70px;
      flex-shrink: 0;
    }
    
    .info-value {
      font-size: 13px;
      color: #444;
      word-break: break-all;
    }
    
    .event-stats {
      display: flex;
      gap: 15px;
      padding: 12px 0;
      border-top: 1px dashed rgba(0, 0, 0, 0.1);
      border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
      margin-bottom: 12px;
    }
    
    .stat-item {
      display: flex;
      align-items: center;
      gap: 5px;
    }
    
    .stat-icon {
      font-size: 14px;
    }
    
    .stat-value {
      font-size: 16px;
      font-weight: 700;
      color: #e8a000;
    }
    
    .stat-label {
      font-size: 12px;
      color: #888;
    }
    
    .event-link {
      font-size: 12px;
      word-break: break-all;
    }
    
    .event-link a {
      color: #f5a623;
      text-decoration: none;
    }
    
    .footer {
      text-align: center;
      margin-top: 20px;
      padding-top: 15px;
      border-top: 2px dashed rgba(245, 166, 35, 0.3);
      color: #888;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
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
      数据来源：AllCPP 无差别同人站 | anime-convention-lizard
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
  containerWidth: number = 800,
  viewportWidth: number = 900
): Promise<string> {
  const browserPage = await ctx.puppeteer.page()
  
  try {
    // 生成 HTML
    const htmlContent = generateHtml(title, events, containerWidth, viewportWidth)
    
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
 * 生成单个漫展详情的 HTML
 */
function generateDetailHtml(
  event: EventData,
  logoBase64: string | null,
  containerWidth: number = 600,
  viewportWidth: number = 700
): string {
  const isOnlineText = typeof event.isOnline === 'string' 
    ? event.isOnline 
    : (event.isOnline ? '线上' : '线下')
  
  let statusClass = 'ongoing'
  let statusBadge = '进行中'
  if (event.ended === '已结束') {
    statusClass = 'ended'
    statusBadge = '已结束'
  } else if (event.ended === '未开始') {
    statusClass = 'upcoming'
    statusBadge = '未开始'
  }

  // 封面图片 HTML
  const logoHtml = logoBase64 
    ? `<div class="logo-section"><img src="data:image/jpeg;base64,${logoBase64}" alt="封面" /></div>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: ${viewportWidth}px;
      min-height: 100%;
      background: linear-gradient(135deg, #fff8e1 0%, #ffe0b2 50%, #ffcc80 100%);
      background-attachment: fixed;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", "Microsoft YaHei", sans-serif;
      color: #333;
    }
    
    body {
      padding: 20px;
    }
    
    .container {
      max-width: ${containerWidth}px;
      margin: 0 auto;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-radius: 20px;
      padding: 25px;
      box-shadow: 0 8px 32px rgba(245, 166, 35, 0.25);
      border: 1px solid rgba(255, 255, 255, 0.4);
    }
    
    .logo-section {
      margin-bottom: 20px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
    }
    
    .logo-section img {
      width: 100%;
      height: auto;
      display: block;
    }
    
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px dashed rgba(245, 166, 35, 0.3);
    }
    
    .status-badge {
      font-size: 14px;
      padding: 6px 14px;
      border-radius: 20px;
      font-weight: 600;
    }
    
    .status-badge.ongoing {
      background: linear-gradient(135deg, #f5a623, #e8a000);
      color: white;
    }
    
    .status-badge.ended {
      background: #e0e0e0;
      color: #666;
    }
    
    .status-badge.upcoming {
      background: linear-gradient(135deg, #4ecdc4, #44a08d);
      color: white;
    }
    
    .online-badge {
      font-size: 14px;
      padding: 6px 14px;
      border-radius: 20px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      color: white;
      font-weight: 500;
    }
    
    .title {
      font-size: 24px;
      font-weight: 700;
      color: #333;
      margin-bottom: 20px;
      line-height: 1.4;
    }
    
    .info-section {
      margin-bottom: 20px;
    }
    
    .info-row {
      display: flex;
      align-items: flex-start;
      padding: 12px 0;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    
    .info-row:last-child {
      border-bottom: none;
    }
    
    .info-label {
      font-size: 14px;
      color: #888;
      min-width: 90px;
      flex-shrink: 0;
      font-weight: 500;
    }
    
    .info-value {
      font-size: 14px;
      color: #333;
      word-break: break-all;
      line-height: 1.5;
    }
    
    .stats-section {
      display: flex;
      justify-content: space-around;
      padding: 20px 0;
      background: linear-gradient(135deg, rgba(245, 166, 35, 0.08), rgba(232, 160, 0, 0.08));
      border-radius: 12px;
      margin-bottom: 20px;
    }
    
    .stat-item {
      text-align: center;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #e8a000;
      display: block;
    }
    
    .stat-label {
      font-size: 12px;
      color: #888;
      margin-top: 4px;
    }
    
    .link-section {
      padding: 15px;
      background: rgba(245, 166, 35, 0.08);
      border-radius: 10px;
      text-align: center;
    }
    
    .link-section a {
      color: #f5a623;
      text-decoration: none;
      font-size: 13px;
      word-break: break-all;
    }
    
    .footer {
      text-align: center;
      margin-top: 15px;
      color: #aaa;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    ${logoHtml}
    
    <div class="header">
      <span class="status-badge ${statusClass}">${statusBadge}</span>
      <span class="online-badge">${isOnlineText}</span>
      ${event.keyword ? `<span class="online-badge">🔖 ${event.keyword}</span>` : ''}
    </div>
    
    <div class="title">${event.name}</div>
    
    <div class="info-section">
      <div class="info-row">
        <span class="info-label">📍 地点</span>
        <span class="info-value">${event.location || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">📮 详细地址</span>
        <span class="info-value">${event.address || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">📅 活动时间</span>
        <span class="info-value">${event.time || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">🏷️ 标签</span>
        <span class="info-value">${event.tag || '-'}</span>
      </div>
    </div>
    
    <div class="stats-section">
      <div class="stat-item">
        <span class="stat-value">${event.wannaGoCount || 0}</span>
        <span class="stat-label">❤️ 想去</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${event.circleCount || 0}</span>
        <span class="stat-label">🏠 社团</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${event.doujinshiCount || 0}</span>
        <span class="stat-label">📚 同人作</span>
      </div>
    </div>
    
    <div class="link-section">
      <a href="${event.url}">${event.url}</a>
    </div>
    
    <div class="footer">
      数据来源：AllCPP 无差别同人站
    </div>
  </div>
</body>
</html>`
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
 * 渲染单个漫展详情为图片
 */
export async function renderEventDetailImage(
  ctx: Context,
  event: EventData,
  imageType: 'png' | 'jpeg' | 'webp' = 'png',
  screenshotQuality: number = 80
): Promise<string> {
  const browserPage = await ctx.puppeteer.page()
  const viewportWidth = 700
  
  try {
    // 获取封面图片的 base64
    const logoBase64 = await fetchImageAsBase64(event.appLogoPicUrl)
    const htmlContent = generateDetailHtml(event, logoBase64, 600, viewportWidth)
    
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
