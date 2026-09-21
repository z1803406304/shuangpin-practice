/**
 * 练习会话的阶段状态机（纯函数）。
 *
 * 三个阶段：
 *   idle    未开始 —— 题面已经显示（可以先看键位图、切输入法），但不接收输入、不计时、不提示
 *   running 进行中
 *   paused  已暂停 —— 冻结计时与提示，接收不到练习输入
 *
 * 为什么要显式区分这三个：
 * 1. 没有「开始」的话，页面一加载就进计时/判定状态，用户准备阶段随手按一下键
 *    就会被记成一次错误，污染整轮成绩。
 * 2. 没有「暂停」的话，走开一会儿（接电话、切标签页）会踩到一个真 bug：
 *    卡住提示定时器照跑，3 秒后自动闪键位，于是这道题被标记为「依赖提示」，
 *    回来之后就不算独立成绩了 —— 可用户根本没看到那个提示。
 */

export type Phase = 'idle' | 'running' | 'paused'

/** 暂停原因，决定回来时的提示文案和是否要重做本题 */
export type PauseReason = 'manual' | 'tab-hidden' | 'idle'

export type PhaseEvent =
  /** 开始（未开始状态下按空格 / 点按钮） */
  | 'start'
  /** 继续（暂停状态下按空格 / 点按钮） */
  | 'resume'
  /** 手动暂停（按钮 / Esc） */
  | 'pause-manual'
  /** 切走了标签页 */
  | 'pause-tab-hidden'
  /** 长时间没有输入（疑似离开） */
  | 'pause-idle'
  /** 重新开始 */
  | 'restart'

/** 暂停类事件 */
export const PAUSE_EVENTS = ['pause-manual', 'pause-tab-hidden', 'pause-idle'] as const

export function isPauseEvent(event: PhaseEvent): boolean {
  return (PAUSE_EVENTS as readonly string[]).includes(event)
}

/** 状态转移：只有 running 能被暂停，只有 idle/paused 需要「开始/继续」 */
export function reduce(phase: Phase, event: PhaseEvent): Phase {
  switch (event) {
    case 'start':
    case 'resume':
      return 'running'
    case 'restart':
      return 'idle'
    default:
      return phase === 'running' ? 'paused' : phase
  }
}

/** 事件对应的暂停原因（非暂停事件返回 null） */
export function reasonOf(event: PhaseEvent): PauseReason | null {
  if (event === 'pause-manual') return 'manual'
  if (event === 'pause-tab-hidden') return 'tab-hidden'
  if (event === 'pause-idle') return 'idle'
  return null
}

/** 只有进行中才接收练习输入（按键、点键位图） */
export function acceptsInput(phase: Phase): boolean {
  return phase === 'running'
}

/** 计时和卡住提示只在进行中运行 */
export function shouldTick(phase: Phase): boolean {
  return phase === 'running'
}

/**
 * 因为「离开较久」而暂停的，回来时本题要重新开始：
 * 那段时间里闪过的提示不算你看过（否则会被误记成依赖提示）。
 */
export function resetsQuestionOnResume(reason: PauseReason | null): boolean {
  return reason === 'idle'
}

/** 暂停期间是否应该把用时冻结（即把暂停时长补进发呆时间） */
export function freezesTimer(reason: PauseReason | null): boolean {
  return reason !== null
}
