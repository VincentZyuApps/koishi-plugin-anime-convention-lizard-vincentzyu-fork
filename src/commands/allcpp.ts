import { Context, h, Session } from 'koishi'
import { Config } from '../config'
import { AllcppEvent, searchAllcppEvents } from '../api/allcpp'
import { renderEventDetailImage, renderEventsImage } from '../render'
import { quote, sendImageFailure } from './feedback'
import { SelectionManager } from './selection'

export interface AllcppSubscription {
  userId: string
  channelId: string
  keyword: string
  createdAt: number
}

declare module 'koishi' {
  interface Tables {
    anime_convention: AllcppSubscription
  }
}

const postgresBigint = 'bigint' as any

function getChannelId(session: Session) {
  return session.guildId ? session.channelId : `private:${session.userId}`
}

function formatDetail(event: AllcppEvent) {
  return [
    `漫展名称: ${event.name}`,
    `地点: ${event.location}`,
    `地址: ${event.address}`,
    `时间: ${event.time}`,
    `标签: ${event.tag}`,
    `状态: ${event.ended || '未知'}`,
    `想去人数: ${event.wannaGoCount}`,
    `社团数: ${event.circleCount}`,
    `同人作数: ${event.doujinshiCount}`,
    `链接: ${event.url}`,
    `参与方式: ${event.isOnline}`,
  ].join('\n')
}

export function registerAllcppCommands(ctx: Context, config: Config, selection: SelectionManager) {
  ctx.model.extend('anime_convention', {
    userId: 'string',
    channelId: 'string',
    keyword: 'string',
    createdAt: postgresBigint,
  }, { primary: ['userId', 'channelId', 'keyword'] })

  const hasPuppeteer = () => !!ctx.puppeteer

  const showDetail = async (session: Session, event: AllcppEvent, imageMode: boolean) => {
    if (imageMode && hasPuppeteer()) {
      try {
        const screenshot = await renderEventDetailImage(
          ctx, event, config.imageType, config.screenshotQuality, config.enableDarkMode, config, 'allcpp',
        )
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}`)
        return
      } catch (error) {
        await sendImageFailure(ctx, session, config, '漫展', error)
        return
      }
    }

    const detail = formatDetail(event)
    try {
      const image = await ctx.http.get(event.appLogoPicUrl, { responseType: 'arraybuffer' })
      const imageData = `data:image/jpeg;base64,${Buffer.from(image).toString('base64')}`
      await session.send(`${quote(session, config)}${h.image(imageData)}\n${detail}`)
    } catch {
      await session.send(`${quote(session, config)}${detail}`)
    }
  }

  const saveSelection = (session: Session, events: AllcppEvent[], imageMode: boolean) => {
    selection.replace(session, { events, imageMode, onSelect: showDetail })
  }

  const runSearch = async (session: Session, keyword: string, imageMode: boolean) => {
    if (!keyword) {
      await session.send('请提供查询关键词，例如：漫展 查询 南京。')
      return
    }
    if (imageMode && !hasPuppeteer()) {
      await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。')
      return
    }

    const waitMessageIds = imageMode
      ? await session.send(`${quote(session, config)}正在查询并渲染图片，请稍候...`)
      : []
    try {
      const { events } = await searchAllcppEvents(ctx, keyword)
      if (!events.length) {
        await session.send('未找到相关漫展信息。')
        return
      }
      if (imageMode) {
        const screenshot = await renderEventsImage(
          ctx, `漫展查询：${keyword}`, events, config.imageType, config.screenshotQuality,
          config.enableDarkMode, 800, 900, config.imageDisplayMode, config, 'allcpp',
        )
        saveSelection(session, events, true)
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}\n回复序号查看详情，输入“0”取消。`)
      } else {
        saveSelection(session, events, false)
        const list = events.map((event, index) => `${index + 1}. ${event.name} - ${event.address}`).join('\n')
        await session.send(`${quote(session, config)}找到以下漫展信息：\n${list}\n回复序号查看详情，输入“0”取消。`)
      }
    } catch (error) {
      if (imageMode) {
        await sendImageFailure(ctx, session, config, '漫展', error)
      } else {
        ctx.logger.error('[漫展] 查询失败:', error)
        await session.send(`${quote(session, config)}查询失败，请稍后重试。`)
      }
    } finally {
      try {
        if (waitMessageIds[0]) await session.bot.deleteMessage(session.channelId, waitMessageIds[0])
      } catch {}
    }
  }

  const runBatchSearch = async (session: Session, imageMode: boolean) => {
    const subscriptions = await ctx.database.get('anime_convention', { userId: session.userId, channelId: getChannelId(session) })
    if (!subscriptions.length) {
      await session.send('你没有订阅任何漫展。')
      return
    }
    if (imageMode && !hasPuppeteer()) {
      await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。')
      return
    }
    const waitMessageIds = imageMode
      ? await session.send(`${quote(session, config)}正在查询 ${subscriptions.length} 个订阅并渲染图片，请稍候...`)
      : []
    try {
      const results = await Promise.all(subscriptions.map(async subscription => {
        try {
          const { events } = await searchAllcppEvents(ctx, subscription.keyword)
          return events.map(event => ({ ...event, keyword: subscription.keyword }))
        } catch {
          return []
        }
      }))
      const events = results.flat()
      if (!events.length) {
        await session.send('未找到订阅的漫展信息。')
        return
      }
      if (imageMode) {
        const screenshot = await renderEventsImage(
          ctx, '订阅漫展一键查询', events, config.imageType, config.screenshotQuality,
          config.enableDarkMode, 800, 900, config.imageDisplayMode, config, 'allcpp',
        )
        saveSelection(session, events, true)
        await session.send(`${quote(session, config)}${h.image(`data:image/${config.imageType};base64,${screenshot}`)}\n回复序号查看详情，输入“0”取消。`)
      } else {
        saveSelection(session, events, false)
        const list = events.map((event, index) => `${index + 1}. [${event.keyword}] ${event.name} - ${event.address}`).join('\n')
        await session.send(`${quote(session, config)}订阅关键词的漫展信息：\n${list}\n回复序号查看详情，输入“0”取消。`)
      }
    } catch (error) {
      if (imageMode) {
        await sendImageFailure(ctx, session, config, '漫展', error)
      } else {
        ctx.logger.error('[漫展] 一键查询失败:', error)
        await session.send(`${quote(session, config)}查询失败，请稍后重试。`)
      }
    } finally {
      try {
        if (waitMessageIds[0]) await session.bot.deleteMessage(session.channelId, waitMessageIds[0])
      } catch {}
    }
  }

  const command = ctx.command('漫展', '无差别同人站漫展查询与订阅')
  command.subcommand('.查询 <keyword>', '查询城市或作品关键词').action(({ session }, keyword) => runSearch(session, keyword, false))
  if (config.enableImageQuery) {
    command.subcommand('.图片查询 <keyword>', '以图片形式查询').alias('.tpcx').action(({ session }, keyword) => runSearch(session, keyword, true))
  }
  command.subcommand('.一键查询', '查询已订阅关键词').action(({ session }) => runBatchSearch(session, false))
  if (config.enableImageBatchQuery) {
    command.subcommand('.一键图片查询', '以图片形式查询已订阅关键词').alias('.yjtpcx').action(({ session }) => runBatchSearch(session, true))
  }
  command.subcommand('.订阅 <keyword>', '订阅一个关键词').action(async ({ session }, keyword) => {
    if (!keyword) return session.send('请提供要订阅的关键词。')
    await ctx.database.upsert('anime_convention', [{ userId: session.userId, channelId: getChannelId(session), keyword, createdAt: Date.now() }])
    await session.send(`已订阅「${keyword}」的漫展信息。`)
  })
  command.subcommand('.取消订阅 [keyword]', '取消一个关键词；省略则取消全部').action(async ({ session }, keyword) => {
    const channelId = getChannelId(session)
    if (!keyword) {
      await session.send('确定取消所有订阅？（是/否）')
      if ((await session.prompt(10_000))?.trim() === '是') {
        await ctx.database.remove('anime_convention', { userId: session.userId, channelId })
        await session.send('已取消所有订阅。')
      } else {
        await session.send('操作取消。')
      }
      return
    }
    const deleted = await ctx.database.remove('anime_convention', { userId: session.userId, channelId, keyword })
    await session.send(deleted ? `已取消订阅「${keyword}」。` : `未找到「${keyword}」的订阅。`)
  })
  command.subcommand('.订阅列表', '查看已订阅关键词').action(async ({ session }) => {
    const subscriptions = await ctx.database.get('anime_convention', { userId: session.userId, channelId: getChannelId(session) })
    await session.send(subscriptions.length ? `你订阅的漫展关键词：\n${subscriptions.map(item => `- ${item.keyword}`).join('\n')}` : '你没有订阅任何漫展。')
  })
}
