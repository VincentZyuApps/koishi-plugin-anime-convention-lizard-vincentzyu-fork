import { Context } from 'koishi'
import {} from 'koishi-plugin-puppeteer'
import { Config } from './config'
import { usage } from './usage'
import { registerAllcppCommands } from './commands/allcpp'
import { registerBilibiliCommands } from './commands/bilibili'
import { createSelectionManager } from './commands/selection'

export const name = 'anime-convention-lizard-vincentzyu-fork'
export const inject = {
  required: ['database'],
  optional: ['puppeteer'],
}

export { Config, usage }

export function apply(ctx: Context, config: Config) {
  const selection = createSelectionManager(ctx)
  registerAllcppCommands(ctx, config, selection)
  registerBilibiliCommands(ctx, config, selection)
}
