import { Context, h, Session } from 'koishi'
import { Config } from '../config'
import {
  BiliEvent,
  BiliScope,
  enrichBiliEventDetail,
  normalizeBiliScope,
  resolveBiliArea,
  searchBiliEvents,
} from '../api/bilibili'
import { renderEventDetailImage, renderEventsImage } from '../render'
import { quote, sendImageFailure } from './feedback'
import { SelectionManager } from './selection'

export interface BiliSubscription {
  userId: string
  channelId: string
  area: string
  createdAt: number
}

declare module 'koishi' {
  interface Tables {
    anime_convention_bili: BiliSubscription
  }
}

const postgresBigint = 'bigint' as any
const SCOPE_USAGE = '漫展 / 展览 / 演出 / 本地生活 / 全部 / 自定义'
const BILI_IMAGE_MAX_RESULTS = 10

function getChannelId(session: Session) {
  return session.guildId ? session.channelId : `private:${session.userId}`
}

function getImageEvents(events: BiliEvent[]) {
  return events.slice(0, BILI_IMAGE_MAX_RESULTS)
}

function getImageLimitNotice(total: number) {
  return total > BILI_IMAGE_MAX_RESULTS
    ? `\n图片查询仅展示最早开始的前 ${BILI_IMAGE_MAX_RESULTS} 项；使用「漫展B 查询 <地区>」查看完整文本结果。`
    : ''
}

function formatEventDetail(event: BiliEvent) {
  const extra = (event.extraDetails || []).map(detail => `${detail.label}: ${detail.value}`)
  return [
    `活动名称: ${event.name}`,
    `活动类别: ${event.category}`,
    `销售状态: ${event.saleFlag}`,
    `活动地点: ${event.location} - ${event.address}`,
    `活动时间: ${event.time || '未知'}`,
    `想去人数: ${event.wannaGoCount}`,
    `售票链接: ${event.url}`,
    ...extra,
  ].join('\n')
}

function formatEventList(events: BiliEvent[], includeArea = false) {
  return events.map((event, index) => {
    const area = includeArea ? `[${event.location}] ` : ''
    return `${index + 1}. ${area}${event.name} - ${event.address}`
  }).join('\n')
}

export function registerBilibiliCommands(ctx: Context, config: Config, selection: SelectionManager) {
  ctx.model.extend('anime_convention_bili', {
    userId: 'string',
    channelId: 'string',
    area: 'string',
    createdAt: postgresBigint,
  }, { primary: ['userId', 'channelId', 'area'] })

  if (!config.enableBili) return

  const hasPuppeteer = () => !!ctx.puppeteer
  const resolveScope = async (session: Session, input?: string): Promise<BiliScope | null> => {
    if (!input) return config.biliDefaultScope
    const scope = normalizeBiliScope(input)
    if (scope) return scope
    await session.send(`未识别的查询范围，请使用：${SCOPE_USAGE}。`)
    return null
  }

  const showDetail = async (session: Session, cachedEvent: BiliEvent, imageMode: boolean) => {
    let event = cachedEvent
    try {
      event = await enrichBiliEventDetail(ctx, event)
    } catch (error) {
      ctx.logger.warn('[漫展B] 获取详情嘉宾失败:', error)
    }
    if (imageMode && hasPuppeteer()) {
      try {
        const screenshot = await renderEventDetailImage(
          ctx, event, config.imageType, config.screenshotQuality, config.enableDarkMode, config, 'bilibili',
        )
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}`)
        return
      } catch (error) {
        await sendImageFailure(ctx, session, config, '漫展B', error)
        return
      }
    }
    const detail = formatEventDetail(event)
    try {
      const image = await ctx.http.get(event.appLogoPicUrl, { responseType: 'arraybuffer' })
      const imageData = `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`
      await session.send(`${quote(session, config)}${h.image(imageData)}\n${detail}`)
    } catch {
      await session.send(`${quote(session, config)}${detail}`)
    }
  }

  const saveSelection = (session: Session, events: BiliEvent[], imageMode: boolean) => {
    selection.replace(session, { events, imageMode, onSelect: showDetail })
  }

  const runSingleSearch = async (session: Session, areaInput: string, scopeInput: string | undefined, fanoutOption: boolean | undefined, imageMode: boolean) => {
    const areaCode = areaInput && resolveBiliArea(areaInput)
    if (!areaCode) {
      await session.send('B站会员购仅支持地区查询。可输入：北京、南京、朝阳区；主题查询请使用「漫展 查询 <关键词>」。')
      return
    }
    const scope = await resolveScope(session, scopeInput)
    if (!scope) return
    if (imageMode && !hasPuppeteer()) {
      await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。')
      return
    }
    const fanout = !!fanoutOption || config.biliEnableFanout
    const waitMessageIds = imageMode ? await session.send(`${quote(session, config)}正在查询 B站会员购活动并渲染图片，请稍候...`) : []
    try {
      const result = await searchBiliEvents(ctx, config, areaCode, scope, fanout)
      if (!result.events.length) {
        await session.send('未找到相关活动。可以尝试更大的地区范围，或使用「--scope 全部」。')
        return
      }
      const title = `B站会员购 · ${scope}范围 · ${result.areaName}`
      if (imageMode) {
        const imageEvents = getImageEvents(result.events)
        const screenshot = await renderEventsImage(
          ctx, title, imageEvents, config.imageType, config.screenshotQuality, config.enableDarkMode,
          800, 900, config.imageDisplayMode, config, 'bilibili',
        )
        saveSelection(session, imageEvents, true)
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}\n回复序号查看详情，输入“0”取消。${getImageLimitNotice(result.events.length)}`)
      } else {
        const limitText = result.totalBeforeLimit > result.events.length ? `，展示最早开始的前 ${result.events.length} 项` : ''
        const fanoutText = fanout ? `，已合并 ${result.queriedAreas} 个地区` : ''
        saveSelection(session, result.events, false)
        await session.send(`${quote(session, config)}${title}\n找到 ${result.totalBeforeLimit} 项活动${limitText}${fanoutText}：\n${formatEventList(result.events)}\n回复序号查看详情，输入“0”取消。`)
      }
    } catch (error) {
      if (imageMode) {
        await sendImageFailure(ctx, session, config, '漫展B', error)
      } else {
        ctx.logger.error('[漫展B] 查询失败:', error)
        await session.send(`${quote(session, config)}B站会员购查询失败，请稍后重试。`)
      }
    } finally {
      try {
        if (waitMessageIds[0]) await session.bot.deleteMessage(session.channelId, waitMessageIds[0])
      } catch {}
    }
  }

  const runBatchSearch = async (session: Session, scopeInput: string | undefined, fanoutOption: boolean | undefined, imageMode: boolean) => {
    const subscriptions = await ctx.database.get('anime_convention_bili', { userId: session.userId, channelId: getChannelId(session) })
    if (!subscriptions.length) {
      await session.send('你没有订阅任何 B站地区活动。使用「漫展B 订阅 北京」添加订阅。')
      return
    }
    const scope = await resolveScope(session, scopeInput)
    if (!scope) return
    if (imageMode && !hasPuppeteer()) {
      await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。')
      return
    }
    const fanout = !!fanoutOption || config.biliEnableFanout
    const waitMessageIds = imageMode ? await session.send(`${quote(session, config)}正在查询 ${subscriptions.length} 个 B站订阅并渲染图片，请稍候...`) : []
    try {
      const uniqueEvents = new Map<number, BiliEvent>()
      for (const subscription of subscriptions) {
        try {
          const result = await searchBiliEvents(ctx, config, subscription.area, scope, fanout)
          for (const event of result.events) uniqueEvents.set(event.projectId, event)
        } catch (error) {
          ctx.logger.warn(`[漫展B] 订阅地区 ${subscription.area} 查询失败: ${error}`)
        }
      }
      const events = [...uniqueEvents.values()].sort((left, right) => left.startUnix - right.startUnix).slice(0, config.biliMaxResults)
      if (!events.length) {
        await session.send('未找到订阅地区的 B站活动。')
        return
      }
      const title = `B站会员购 · ${scope}范围 · 订阅地区`
      if (imageMode) {
        const imageEvents = getImageEvents(events)
        const screenshot = await renderEventsImage(
          ctx, title, imageEvents, config.imageType, config.screenshotQuality, config.enableDarkMode,
          800, 900, config.imageDisplayMode, config, 'bilibili',
        )
        saveSelection(session, imageEvents, true)
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}\n回复序号查看详情，输入“0”取消。${getImageLimitNotice(events.length)}`)
      } else {
        saveSelection(session, events, false)
        await session.send(`${quote(session, config)}${title}\n${formatEventList(events, true)}\n回复序号查看详情，输入“0”取消。`)
      }
    } catch (error) {
      if (imageMode) {
        await sendImageFailure(ctx, session, config, '漫展B', error)
      } else {
        ctx.logger.error('[漫展B] 一键查询失败:', error)
        await session.send(`${quote(session, config)}B站会员购查询失败，请稍后重试。`)
      }
    } finally {
      try {
        if (waitMessageIds[0]) await session.bot.deleteMessage(session.channelId, waitMessageIds[0])
      } catch {}
    }
  }

  const command = ctx.command('漫展B', 'B站会员购地区活动查询与订阅')
  command.subcommand('.查询 <area>', '查询一个地区的 B站会员购活动')
    .option('scope', '-s <scope:string> 仅本次覆盖默认范围')
    .option('fanout', '-f  按区县展开查询，提高大城市覆盖率')
    .action(({ session, options }, area) => runSingleSearch(session, area, options.scope, options.fanout, false))
  if (config.enableImageQuery) {
    command.subcommand('.图片查询 <area>', '以图片形式查询一个地区的 B站会员购活动')
      .option('scope', '-s <scope:string> 仅本次覆盖默认范围')
      .option('fanout', '-f  按区县展开查询，提高大城市覆盖率')
      .action(({ session, options }, area) => runSingleSearch(session, area, options.scope, options.fanout, true))
  }
  command.subcommand('.一键查询', '查询所有已订阅地区的 B站会员购活动')
    .option('scope', '-s <scope:string> 仅本次覆盖默认范围')
    .option('fanout', '-f  按区县展开查询，提高大城市覆盖率')
    .action(({ session, options }) => runBatchSearch(session, options.scope, options.fanout, false))
  if (config.enableImageBatchQuery) {
    command.subcommand('.一键图片查询', '以图片形式查询所有已订阅地区的 B站会员购活动')
      .option('scope', '-s <scope:string> 仅本次覆盖默认范围')
      .option('fanout', '-f  按区县展开查询，提高大城市覆盖率')
      .action(({ session, options }) => runBatchSearch(session, options.scope, options.fanout, true))
  }
  command.subcommand('.订阅 <area>', '订阅一个地区的 B站会员购活动').action(async ({ session }, area) => {
    const areaCode = area && resolveBiliArea(area)
    if (!areaCode) return session.send('请提供可识别的地区，例如：漫展B 订阅 北京。')
    await ctx.database.upsert('anime_convention_bili', [{ userId: session.userId, channelId: getChannelId(session), area: areaCode, createdAt: Date.now() }])
    await session.send(`已订阅「${area}」的 B站会员购活动；一键查询将使用默认范围「${config.biliDefaultScope}」。`)
  })
  command.subcommand('.取消订阅 [area]', '取消一个地区订阅；省略则取消全部').action(async ({ session }, area) => {
    const channelId = getChannelId(session)
    if (!area) {
      await session.send('确定取消所有 B站地区订阅？（是/否）')
      if ((await session.prompt(10_000))?.trim() === '是') {
        await ctx.database.remove('anime_convention_bili', { userId: session.userId, channelId })
        await session.send('已取消所有 B站地区订阅。')
      } else {
        await session.send('操作取消。')
      }
      return
    }
    const areaCode = resolveBiliArea(area)
    if (!areaCode) return session.send('未识别的地区，请输入例如：北京、南京、朝阳区。')
    const deleted = await ctx.database.remove('anime_convention_bili', { userId: session.userId, channelId, area: areaCode })
    await session.send(deleted ? `已取消订阅「${area}」。` : `未找到「${area}」的订阅。`)
  })
  command.subcommand('.订阅列表', '查看已订阅的 B站地区活动').action(async ({ session }) => {
    const subscriptions = await ctx.database.get('anime_convention_bili', { userId: session.userId, channelId: getChannelId(session) })
    await session.send(subscriptions.length
      ? `B站地区订阅（默认范围：${config.biliDefaultScope}）：\n${subscriptions.map(subscription => `- ${subscription.area}`).join('\n')}`
      : '你没有订阅任何 B站地区活动。')
  })
}
