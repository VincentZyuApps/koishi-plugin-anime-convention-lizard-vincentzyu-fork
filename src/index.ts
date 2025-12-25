import { Context, Schema, Session, h } from 'koishi';
import { renderEventsImage, renderEventDetailImage, EventData } from './render';
import {} from 'koishi-plugin-puppeteer';

export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
};
export const name = 'anime-convention-lizard-vincentzyu-fork';
export const usage = `
# 🎉 开箱即用的漫展查询插件

## 简介
- **anime-convention-lizard-vincentzyu-fork** 是一款针对漫展查询与订阅的 Koishi 插件，对接无差别同人站/CPP，通过简单的指令快速查询城市或主题相关的漫展，并提供订阅与管理功能。

---

## 使用方法

### 通过关键词查询漫展
#### 示例：
\`\`\`
漫展 查询 南京    // 查询南京的漫展
漫展 查询 东方    // 查询与东方相关的漫展
\`\`\`

### 一键查询所有订阅的漫展
#### 示例：
\`\`\`
漫展 一键查询    // 查询所有已订阅关键词的漫展
\`\`\`

### 🖼️ 图片查询（需开启配置并安装 puppeteer）
#### 示例：
\`\`\`
漫展 图片查询 南京    // 以图片形式展示查询结果
漫展 一键图片查询     // 以图片形式展示所有订阅的漫展
\`\`\`

### 订阅漫展关键词
#### 示例：
\`\`\`
漫展 订阅 南京    // 订阅南京的漫展
漫展 订阅 东方    // 订阅与东方相关的漫展
\`\`\`

### 取消订阅漫展关键词
#### 示例：
\`\`\`
漫展 取消订阅 南京    // 取消订阅南京的漫展
漫展 取消订阅         // 取消所有订阅
\`\`\`

### 查看当前订阅列表
#### 示例：
\`\`\`
漫展 订阅列表    // 查看当前订阅的关键词列表
\`\`\`

---

## 反馈建议或报告问题

可以[点这里](https://github.com/lizard0126/anime-convention-lizard/issues)创建议题~

## 如果喜欢我的插件

可以[请我喝可乐](https://ifdian.net/a/lizard0126)，没准就有动力更新新功能了~
`;

// export const Config = Schema.object({
//   apiUrl: Schema.string()
//     .default('http://192.168.31.241:51225/search')
//     .description('默认API请勿更改'),
// });

export const Config = Schema.intersect([

  Schema.object({
    apiUrl: Schema.string()
    .default('http://xwl.vincentzyu233.cn:51225/search')
    .description('默认API请勿更改'),
  }).description('后端api设置'),

  Schema.object({
    addQuote: Schema.boolean()
    .default(true)
    .description('bot回复指令消息的时候是否添加回复')
  }).description('消息设置'),

  Schema.object({
    enableImageQuery: Schema.boolean()
      .default(false)
      .description('是否注册「漫展 图片查询」指令（需要 puppeteer 服务）'),
    enableImageBatchQuery: Schema.boolean()
      .default(false)
      .description('是否注册「漫展 一键图片查询」指令（需要 puppeteer 服务）'),
    imageType: Schema.union([
      Schema.const('png').description('PNG 格式'),
      Schema.const('jpeg').description('JPEG 格式'),
      Schema.const('webp').description('WebP 格式'),
    ])
      .role('radio')
      .default('png')
      .description('渲染图片的输出格式'),
    screenshotQuality: Schema.number()
      .min(0).max(100).step(1)
      .default(80)
      .description('截图质量 (0-100)，仅对 JPEG/WebP 有效'),
  }).description('🖼️ 图片渲染设置（需要 puppeteer）'),

])

declare module 'koishi' {
  interface Tables {
    anime_convention: Subscription;
  }
}

export interface Subscription {
  userId: string;
  channelId: string;
  keyword: string;
  createdAt: number;
}

export function apply(ctx: Context, config: any) {
  ctx.model.extend('anime_convention', {
    userId: 'string',
    channelId: 'string',
    keyword: 'string',
    createdAt: 'integer',
  }, { primary: ['userId', 'channelId', 'keyword'] });

  const userSearchCache: Record<string, { cache: any[]; timeoutId?: NodeJS.Timeout; imageMode?: boolean }> = {};
  const getChannelId = (session: Session) => session.guildId ? session.channelId : `private:${session.userId}`;

  // 检查 puppeteer 是否可用
  const hasPuppeteer = () => !!ctx.puppeteer;

  ctx.command('漫展', '漫展查询和订阅管理')
    .subcommand('.查询 <keyword>', '查询漫展')
    .action(async ({ session }, keyword) => {
      if (!keyword) {
        await session.send('请提供查询关键词，例如：漫展 查询 南京');
        return;
      };

      if (userSearchCache[session.userId]) {
        clearTimeout(userSearchCache[session.userId].timeoutId);
        delete userSearchCache[session.userId];
      }

      try {
        const response = await ctx.http.get(config.apiUrl + '?msg=' + encodeURIComponent(keyword));
        if (response.code !== 200 || !response.data?.length) {
          await session.send('未找到相关漫展信息。');
          return;
        };

        userSearchCache[session.userId] = { cache: response.data };
        const message = response.data.map((item: any, i: number) => `[${i + 1}]\t ${item.name} - ${item.address}`).join('\n');
        session.send(`${config.addQuote ? h.quote(session.messageId) : ''}找到以下漫展信息：\n${message}\n请输入序号查看详情，输入“0”取消。`);

        userSearchCache[session.userId].timeoutId = setTimeout(() => {
          delete userSearchCache[session.userId];
          session.send('超时未选择，请重新查询。');
        }, 15000);
      } catch (error) {
        ctx.logger.error('查询 API 失败:', error);
        session.send('查询失败，请稍后重试。');
      }
    });

  // 图片查询指令
  if (config.enableImageQuery) {
    ctx.command('漫展', '漫展查询和订阅管理')
      .subcommand('.图片查询 <keyword>', '查询漫展（图片形式）')
      .alias('.tpcx')
      .action(async ({ session }, keyword) => {
        if (!keyword) {
          await session.send('请提供查询关键词，例如：漫展 图片查询 南京');
          return;
        }

        if (!hasPuppeteer()) {
          await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。');
          return;
        }

        // 清除之前的缓存
        if (userSearchCache[session.userId]) {
          clearTimeout(userSearchCache[session.userId].timeoutId);
          delete userSearchCache[session.userId];
        }

        const waitMsgIds = await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}✨ 正在查询并渲染图片，请稍候...`);

        try {
          const response = await ctx.http.get(config.apiUrl + '?msg=' + encodeURIComponent(keyword));
          if (response.code !== 200 || !response.data?.length) {
            await session.send('未找到相关漫展信息。');
            return;
          }

          const events: EventData[] = response.data;
          const screenshot = await renderEventsImage(
            ctx,
            `漫展查询：${keyword}`,
            events,
            config.imageType || 'png',
            config.screenshotQuality || 80
          );

          // 存入缓存，标记为图片模式
          userSearchCache[session.userId] = { cache: events, imageMode: true };

          await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}${h.image(`data:image/${config.imageType || 'png'};base64,${screenshot}`)}\n请输入序号查看详情，输入"0"取消。`);

          userSearchCache[session.userId].timeoutId = setTimeout(() => {
            delete userSearchCache[session.userId];
            session.send('超时未选择，请重新查询。');
          }, 30000);  // 图片模式给30秒
        } catch (error) {
          ctx.logger.error('图片查询失败:', error);
          await session.send('查询失败，请稍后重试。');
        } finally {
          // 删除等待提示消息
          try {
            if (waitMsgIds?.[0]) {
              await session.bot.deleteMessage(session.channelId, waitMsgIds[0]);
            }
          } catch {}
        }
      });
  }

  // 一键图片查询指令
  if (config.enableImageBatchQuery) {
    ctx.command('漫展', '漫展查询和订阅管理')
      .subcommand('.一键图片查询', '查询订阅的所有漫展（图片形式）')
      .alias('.yjtpcx')
      .action(async ({ session }) => {
        if (!hasPuppeteer()) {
          await session.send('图片渲染功能需要 puppeteer 服务，请联系管理员启用。');
          return;
        }

        const subscriptions = await ctx.database.get('anime_convention', { userId: session.userId, channelId: getChannelId(session) });
        if (!subscriptions.length) {
          await session.send('你没有订阅任何漫展。');
          return;
        }

        // 清除之前的缓存
        if (userSearchCache[session.userId]) {
          clearTimeout(userSearchCache[session.userId].timeoutId);
          delete userSearchCache[session.userId];
        }

        const waitMsgIds = await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}✨ 正在查询 ${subscriptions.length} 个订阅并渲染图片，请稍候...`);

        try {
          const results = await Promise.all(subscriptions.map(async (sub) => {
            try {
              const response = await ctx.http.get(config.apiUrl + '?msg=' + encodeURIComponent(sub.keyword));
              return response.code === 200 ? response.data.map((item: any) => ({ ...item, keyword: sub.keyword })) : [];
            } catch {
              return [];
            }
          }));

          const allResults: EventData[] = results.flat();
          if (!allResults.length) {
            await session.send('未找到订阅的漫展信息。');
            return;
          }

          const screenshot = await renderEventsImage(
            ctx,
            '订阅漫展一键查询',
            allResults,
            config.imageType || 'png',
            config.screenshotQuality || 80
          );

          // 存入缓存，标记为图片模式
          userSearchCache[session.userId] = { cache: allResults, imageMode: true };

          await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}${h.image(`data:image/${config.imageType || 'png'};base64,${screenshot}`)}\n请输入序号查看详情，输入"0"取消。`);

          userSearchCache[session.userId].timeoutId = setTimeout(() => {
            delete userSearchCache[session.userId];
            session.send('超时未选择，请重新查询。');
          }, 30000);  // 图片模式给30秒
        } catch (error) {
          ctx.logger.error('一键图片查询失败:', error);
          await session.send('查询失败，请稍后重试。');
        } finally {
          // 删除等待提示消息
          try {
            if (waitMsgIds?.[0]) {
              await session.bot.deleteMessage(session.channelId, waitMsgIds[0]);
            }
          } catch {}
        }
      });
  }

  ctx.command('漫展', '漫展查询和订阅管理')
    .subcommand('.一键查询', '查询订阅的所有漫展')
    .action(async ({ session }) => {
      const subscriptions = await ctx.database.get('anime_convention', { userId: session.userId, channelId: getChannelId(session) });
      if (!subscriptions.length) {
        await session.send('你没有订阅任何漫展。');
        return;
      };

      const results = await Promise.all(subscriptions.map(async (sub) => {
        try {
          const response = await ctx.http.get(config.apiUrl + '?msg=' + encodeURIComponent(sub.keyword));
          return response.code === 200 ? response.data.map((item: any) => ({ ...item, keyword: sub.keyword })) : [];
        } catch {
          return [];
        }
      }));

      const allResults = results.flat();
      if (!allResults.length) {
        await session.send('未找到订阅的漫展信息。');
        return;
      };

      const message = allResults.map((item, i) => `${i + 1}. [${item.keyword}] ${item.name} - ${item.address}`).join('\n');
      session.send(`订阅关键词的漫展信息：\n${message}\n请输入序号查看详情，输入“0”取消。`);

      userSearchCache[session.userId] = { cache: allResults };
      userSearchCache[session.userId].timeoutId = setTimeout(() => delete userSearchCache[session.userId], 15000);
    });

  ctx.command('漫展', '漫展查询和订阅管理')
    .subcommand('.订阅 <keyword>', '订阅漫展')
    .action(async ({ session }, keyword) => {
      const channelId = getChannelId(session);
      await ctx.database.upsert('anime_convention', [{ userId: session.userId, channelId, keyword, createdAt: Date.now() }]);
      session.send(`已订阅「${keyword}」的漫展信息。`);
    });

  ctx.command('漫展', '漫展查询和订阅管理')
    .subcommand('.取消订阅 [keyword]', '取消订阅')
    .action(async ({ session }, keyword) => {
      const channelId = getChannelId(session);
      if (!keyword) {
        await session.send('确定取消所有订阅？（是/否）');
        if ((await session.prompt(10000))?.toLowerCase() === '是') {
          await ctx.database.remove('anime_convention', { userId: session.userId, channelId });
          await session.send('已取消所有订阅。');
          return;
        }
        await session.send('操作取消。');
        return;
      }

      const deleted = await ctx.database.remove('anime_convention', { userId: session.userId, channelId, keyword });
      session.send(deleted ? `已取消订阅「${keyword}」。` : `未找到「${keyword}」的订阅。`);
    });

  ctx.command('漫展', '漫展查询和订阅管理')
    .subcommand('.订阅列表', '查看订阅列表')
    .action(async ({ session }) => {
      const subscriptions = await ctx.database.get('anime_convention', { userId: session.userId, channelId: getChannelId(session) });
      if (!subscriptions.length) {
        await session.send('你没有订阅任何漫展。');
        return;
      }
      session.send('你订阅的漫展关键词：\n' + subscriptions.map((sub) => `- ${sub.keyword}`).join('\n'));
    });

  ctx.middleware(async (session, next) => {
    const userCache = userSearchCache[session.userId];
    if (!userCache?.cache) return next();

    const choice = parseInt(session.content?.trim() || '');
    if (isNaN(choice) || choice < 1 || choice > userCache.cache.length) {
      if (session.content === '0') {
        clearTimeout(userCache.timeoutId);
        delete userSearchCache[session.userId];
        await session.send('已取消操作。');
        return;
      }
      await session.send('无效选择，请输入正确的序号。');
      return;
    }

    clearTimeout(userCache.timeoutId);
    const selectedItem = userCache.cache[choice - 1];

    // 如果是图片模式，渲染图片返回
    if (userCache.imageMode && hasPuppeteer()) {
      try {
        const screenshot = await renderEventDetailImage(
          ctx,
          selectedItem,
          config.imageType || 'png',
          config.screenshotQuality || 80
        );
        await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}${h.image(`data:image/${config.imageType || 'png'};base64,${screenshot}`)}`);
      } catch (error) {
        ctx.logger.error('渲染详情图片失败:', error);
        // 回退到文字模式
        const isOnlineText = typeof selectedItem.isOnline === 'string' 
          ? selectedItem.isOnline 
          : (selectedItem.isOnline ? '线上' : '线下');
        const result =
          `漫展名称: \t${selectedItem.name}\n` +
          `地点: \t${selectedItem.location}\n` +
          `地址: \t${selectedItem.address}\n` +
          `时间: \t${selectedItem.time}\n` +
          `标签: \t${selectedItem.tag}\n` +
          `状态: \t${selectedItem.ended || '未知'}\n` +
          `想去人数: \t${selectedItem.wannaGoCount}\n` +
          `社团数: \t${selectedItem.circleCount}\n` +
          `同人作数: \t${selectedItem.doujinshiCount}\n` +
          `链接: \t${selectedItem.url}\n` +
          `参与方式: \t${isOnlineText}`;
        await session.send(result);
      }
      delete userSearchCache[session.userId];
      return;
    }

    // 文字模式
    const isOnlineText = typeof selectedItem.isOnline === 'string' 
      ? selectedItem.isOnline 
      : (selectedItem.isOnline ? '线上' : '线下');
    const result =
      `漫展名称: \t${selectedItem.name}\n` +
      `地点: \t${selectedItem.location}\n` +
      `地址: \t${selectedItem.address}\n` +
      `时间: \t${selectedItem.time}\n` +
      `标签: \t${selectedItem.tag}\n` +
      `状态: \t${selectedItem.ended || '未知'}\n` +
      `想去人数: \t${selectedItem.wannaGoCount}\n` +
      `社团数: \t${selectedItem.circleCount}\n` +
      `同人作数: \t${selectedItem.doujinshiCount}\n` +
      `链接: \t${selectedItem.url}\n` +
      `参与方式: \t${isOnlineText}`;

    try {
      const img = await ctx.http.get(selectedItem.appLogoPicUrl, {
        headers: {
          refer: 'https://cp.allcpp.cn/',
        },
      });
      await session.send(`${config.addQuote ? h.quote(session.messageId) : ''}${h.image(img)}\n${result}`);
    } catch (error) {
      console.error('获取图片失败:', error);
      await session.send(result);
    }
    delete userSearchCache[session.userId];
  });
}