import { Schema } from 'koishi'
import { BILI_CATEGORIES, BILI_CHANNELS, BILI_SCOPES, BiliChannel, BiliConfig, BiliScope } from './api/bilibili'

export type ImageDisplayMode = 'none' | 'compact' | 'gradient' | 'flip-horizontal' | 'full-blur-bg-text'
export type ImageType = 'png' | 'jpeg' | 'webp'
export const FONT_MODE = {
  NPM_LXGW: 'npm-lxgw',
  RELEASE_LXGW: 'release-lxgw',
  CUSTOM_PATH: 'custom-path',
  SYSTEM_DEFAULT: 'system-default',
} as const
export type FontMode = typeof FONT_MODE[keyof typeof FONT_MODE]

export interface Config extends BiliConfig {
  addQuote: boolean
  enableImageQuery: boolean
  enableImageBatchQuery: boolean
  imageDisplayMode: ImageDisplayMode
  fontMode: FontMode
  customFontPath: string
  allowEmojiFontFallback: boolean
  allowSystemFontFallback: boolean
  enableDarkMode: boolean
  imageType: ImageType
  screenshotQuality: number
  enableBili: boolean
  verboseConsoleLog: boolean
  verboseSessionLog: boolean
}

export const Config: Schema<Config> = Schema.intersect([
  Schema.object({
    addQuote: Schema.boolean().default(true).description('↩️ Bot 回复指令消息时是否添加引用回复'),
  }).description('💬 消息设置'),
  Schema.object({
    enableImageQuery: Schema.boolean().default(false).description('🖼️ 是否注册「漫展 / 漫展B 图片查询」指令（需要 Puppeteer 服务）'),
    enableImageBatchQuery: Schema.boolean().default(false).description('📚 是否注册「漫展 / 漫展B 一键图片查询」指令（需要 Puppeteer 服务）'),
    imageDisplayMode: Schema.union([
      Schema.const('none').description('🚫 不展示封面图片'),
      Schema.const('compact').description('🖼️ 左侧展示 4:3 封面'),
      Schema.const('gradient').description('🌈 渐变背景封面'),
      Schema.const('flip-horizontal').description('🪞 全背景镜像封面'),
      Schema.const('full-blur-bg-text').description('🌫️ 模糊全背景与文字覆盖'),
    ]).role('radio').default('gradient').description('🎨 图片查询列表的封面展示方式'),
    fontMode: Schema.union([
      Schema.const(FONT_MODE.NPM_LXGW).description('📦 霞鹜文楷（内置 npm，默认）'),
      Schema.const(FONT_MODE.RELEASE_LXGW).description('☁️ 霞鹜文楷等宽版（Gitee / GitHub Release 下载）'),
      Schema.const(FONT_MODE.CUSTOM_PATH).description('📁 指定字体绝对路径'),
      Schema.const(FONT_MODE.SYSTEM_DEFAULT).description('🔤 浏览器系统默认字体'),
    ]).role('radio').default(FONT_MODE.NPM_LXGW).description([
      '🔤 Puppeteer 图片字体，影响「漫展」与「漫展B」的全部图片查询。',
      '<i>【npm-lxgw】使用随插件安装的霞鹜文楷普通版，不联网。</i>',
      '<i>【release-lxgw】首次使用时下载霞鹜文楷等宽版到 Koishi 根目录 <code>data/fonts</code>，依次尝试 Gitee 与 GitHub。</i>',
      '<i>【custom-path】使用下方填写的 Koishi 服务端字体绝对路径。</i>',
      '<i>【system-default】不读取字体文件，使用 Chromium 浏览器系统字体栈。</i>',
      '⚠️ 所选字体不可用时，图片查询会明确报错；请修复配置或切换其他模式。',
    ].join('<br/>')),
    customFontPath: Schema.string().default('').role('textarea', { rows: [2, 5] }).description('📁 自定义字体绝对路径，仅选择【custom-path】时生效；支持 .ttf、.otf、.woff、.woff2。'),
    allowEmojiFontFallback: Schema.boolean().default(true).experimental().description('🧪 选定字体缺少 emoji 时，是否仅用系统 emoji 字体补字；默认开启。'),
    allowSystemFontFallback: Schema.boolean().default(false).experimental().description('🧪 选定字体缺少普通字符时，是否用系统默认字体补字；默认关闭。开启后也可补充未被 emoji 专用补字处理的 emoji。'),
    enableDarkMode: Schema.boolean().default(false).description('🌙 是否启用深色图片主题'),
    imageType: Schema.union([
      Schema.const('png').description('🟦 PNG 格式'),
      Schema.const('jpeg').description('🟧 JPEG 格式'),
      Schema.const('webp').description('🟩 WebP 格式'),
    ]).role('radio').default('png').description('📦 图片输出格式'),
    screenshotQuality: Schema.number().min(0).max(100).step(1).default(80).description('🎚️ 截图质量，仅 JPEG/WebP 生效'),
  }).description('🖼️ 图片渲染设置（需要 Puppeteer）'),
  Schema.object({
    enableBili: Schema.boolean().default(true).description('📺 是否启用「漫展B」B站会员购指令'),
    biliDefaultScope: Schema.union([
      ...BILI_SCOPES.map(scope => Schema.const(scope).description(`🎯 【${scope}】${scope === '漫展' ? '漫展与同人展' : scope === '全部' ? '全部频道' : scope === '自定义' ? '使用下方高级规则' : `B站${scope}频道`}`)),
    ]).role('radio').default('漫展').description('🎯 B站默认查询范围；订阅的一键查询也使用此值'),
    biliEnableFanout: Schema.boolean().default(false).description('🏙️ 是否默认按区县展开 B站查询'),
    biliFanoutConcurrency: Schema.number().min(1).max(10).step(1).default(3).description('🚦 区县展开时的 B站请求并发数'),
    biliMaxResults: Schema.number().min(1).max(100).step(1).default(50).description('🔢 B站查询最多展示结果数'),
    biliCustomChannels: Schema.array(Schema.union([
      ...BILI_CHANNELS.map(channel => Schema.const(channel)),
    ])).role('checkbox').default(['展览', '混合'] as BiliChannel[]).description('🧩 [biliCustomChannels] 自定义范围使用的请求频道'),
    biliCustomCategories: Schema.array(Schema.union([
      ...BILI_CATEGORIES.map(category => Schema.const(category)),
    ])).role('checkbox').default(['漫展', 'Only同人展', 'IP展览', '其他展览']).description('🏷️ [biliCustomCategories] 自定义范围保留的活动体裁；留空则不筛选'),
    biliExtraCategories: Schema.array(Schema.object({
      name: Schema.string().description('✍️ B站新增或自定义体裁名称'),
      enabled: Schema.boolean().default(true).description('✅ 是否启用'),
    })).role('table').default([]).description('➕ 附加体裁，仅自定义范围生效'),
  }).description('📺 B站会员购设置'),
  Schema.object({
    verboseConsoleLog: Schema.boolean().default(false).description('🖥️ 是否输出详细控制台日志'),
    verboseSessionLog: Schema.boolean().default(false).description('💬 是否在会话中输出调试信息'),
  }).description('🐛 调试设置'),
])
