/**
 * 卡住自动提示的策略（纯函数，不依赖定时器 / Vue，可完整跑单测）。
 *
 * 设计：把「等了多久」映射成「提示到第几级」，实际排定时器的地方只负责
 * 按 nextStageDelay() 的返回值去 tick，策略本身在这里集中定义和测试。
 *
 * 两个级别：
 *   1 级 = 弱提示：在键位图上闪烁「下一键」（帮你回忆，但不给答案）
 *   2 级 = 强提示：直接把答案显示出来（输入槽 ghost 字母 + 高亮剩余键）
 *
 * 默认策略是「只闪键位」：revealAfterMs = 0 表示永远不自动给答案。
 */

export type HintStage = 0 | 1 | 2

export interface HintPolicy {
  /** 弱提示（闪下一键）的等待阈值；<= 0 表示整体关闭自动提示 */
  hintAfterMs: number
  /** 自动显示答案的等待阈值；<= 0 表示永远不自动给答案（只闪键位） */
  revealAfterMs: number
}

export const HINT_OFF: HintPolicy = { hintAfterMs: 0, revealAfterMs: 0 }

/** 自动提示是否启用 */
export function isHintEnabled(policy: HintPolicy): boolean {
  return policy.hintAfterMs > 0 || policy.revealAfterMs > 0
}

/** 各提示级别的等待阈值（升序、去重、去掉未启用的） */
function thresholds(policy: HintPolicy): number[] {
  const list: number[] = []
  if (policy.hintAfterMs > 0) list.push(policy.hintAfterMs)
  if (policy.revealAfterMs > 0) list.push(policy.revealAfterMs)
  return [...new Set(list)].sort((a, b) => a - b)
}

/** 已经等了 idleMs 毫秒，现在应该提示到第几级 */
export function stageForIdle(idleMs: number, policy: HintPolicy): HintStage {
  if (!isHintEnabled(policy) || idleMs < 0) return 0
  if (policy.revealAfterMs > 0 && idleMs >= policy.revealAfterMs) return 2
  if (policy.hintAfterMs > 0 && idleMs >= policy.hintAfterMs) return 1
  return 0
}

/**
 * 距离下一次「升级提示」还有多少毫秒；已经到顶或未启用时返回 null。
 * 排定时器时用这个值做延迟，这样改配置/重置计时都不会算错时间。
 */
export function nextStageDelay(idleMs: number, policy: HintPolicy): number | null {
  if (!isHintEnabled(policy)) return null
  const next = thresholds(policy).find((value) => value > idleMs)
  return next === undefined ? null : next - idleMs
}

/** 提示进度 0~1（给等待进度条用，填满表示即将提示） */
export function hintProgress(idleMs: number, policy: HintPolicy): number {
  if (!isHintEnabled(policy) || idleMs <= 0) return 0
  const first = thresholds(policy)[0]
  if (first === undefined) return 0
  return Math.min(1, idleMs / first)
}
