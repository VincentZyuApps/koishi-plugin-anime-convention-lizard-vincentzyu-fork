import { Context, Session } from 'koishi'

export interface Selection<T> {
  events: T[]
  imageMode: boolean
  onSelect: (session: Session, event: T, imageMode: boolean) => Promise<void>
  timeoutId?: NodeJS.Timeout
}

export interface SelectionManager {
  replace<T>(session: Session, selection: Omit<Selection<T>, 'timeoutId'>): void
  clear(userId: string): void
}

export function createSelectionManager(ctx: Context): SelectionManager {
  const selections: Record<string, Selection<unknown>> = {}

  const clear = (userId: string) => {
    const selection = selections[userId]
    if (!selection) return
    clearTimeout(selection.timeoutId)
    delete selections[userId]
  }

  ctx.middleware(async (session, next) => {
    const selection = selections[session.userId]
    if (!selection) return next()

    const choice = Number.parseInt(session.content?.trim() || '', 10)
    if (choice === 0) {
      clear(session.userId)
      await session.send('已取消操作。')
      return
    }
    if (Number.isNaN(choice) || choice < 1 || choice > selection.events.length) {
      await session.send('无效选择，请输入正确的序号。')
      return
    }

    clear(session.userId)
    await selection.onSelect(session, selection.events[choice - 1], selection.imageMode)
  })

  return {
    replace<T>(session: Session, selection: Omit<Selection<T>, 'timeoutId'>) {
      clear(session.userId)
      const entry = selection as Selection<unknown>
      selections[session.userId] = entry
      entry.timeoutId = setTimeout(() => {
        delete selections[session.userId]
        session.send('超时未选择，请重新查询。')
      }, entry.imageMode ? 30_000 : 15_000)
    },
    clear,
  }
}
