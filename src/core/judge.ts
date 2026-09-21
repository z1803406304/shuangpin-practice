/**
 * 逐键判定状态机（纯函数）。
 *
 * 判定语义：
 * - 每个音节固定两次击键：第 1 键 = 声母，第 2 键 = 韵母。
 * - 按对 -> typed 前进一位；两位都按对 -> status = 'correct'。
 * - 按错 -> 计入 errors；两种模式的区别只在于「已按对的键是否保留」：
 *   · strict（严格，默认）：本题作废，typed 清空，必须重打本题；failed = true。
 *   · lenient（宽松）：保留进度，按对正确的键即可继续；话题仍标记为「有错」。
 *
 * 之所以把「首击全对」与「有错但打完了」区分开（failed 标记），是因为
 * 双拼练习里这两个指标意义完全不同：前者衡量记忆准确度，后者衡量容错后的完成度。
 */

import type { Encoded } from './schemes/index.ts'

export type JudgeStatus = 'typing' | 'correct' | 'wrong'

/** 一次按键产生的效果，供 UI 做动画 / 统计 */
export type JudgeEvent =
  /** 按对但本题未完成 */
  | 'hit'
  /** 按错 */
  | 'miss'
  /** 本题完成 */
  | 'complete'
  /** 本题已判错（严格模式下需要重打） */
  | 'ignored'

export interface JudgeState {
  /** 已按对的键码 */
  typed: string[]
  status: JudgeStatus
  /** 本题累计错键次数 */
  errors: number
  /** 最近一次按错的键码（键位图闪红用），null 表示本题没按错过 */
  lastWrongCode: string | null
  /** 本题是否曾经按错（严格模式下即「本题作废」） */
  failed: boolean
}

export interface JudgeOptions {
  /** 严格模式：错键即清空重打本题 */
  strict: boolean
}

export type JudgeEffect = 'ignored' | 'hit' | 'miss' | 'complete'

export function createJudgeState(): JudgeState {
  return { typed: [], status: 'typing', errors: 0, lastWrongCode: null, failed: false }
}

/** 下一键应该按的键码；本题已完成时返回 null */
export function nextExpectedCode(state: JudgeState, target: Encoded): string | null {
  if (state.status === 'correct') return null
  return target.codes[state.typed.length] ?? null
}

/** 已按对的字母，用于输入槽展示（如 ['c','h']） */
export function typedLetters(state: JudgeState): string[] {
  return state.typed
}

/**
 * 处理一次按键。
 * @returns 新的状态；state 本身不被修改
 */
export function pressKey(
  state: JudgeState,
  code: string,
  target: Encoded,
  options: JudgeOptions,
): { state: JudgeState; event: JudgeEffect } {
  if (state.status === 'correct') return { state, event: 'ignored' }

  const expected = target.codes[state.typed.length]
  if (code === expected) {
    const typed = [...state.typed, code]
    const done = typed.length >= target.codes.length
    return {
      state: {
        ...state,
        typed: done ? typed : typed,
        status: done ? 'correct' : 'typing',
        lastWrongCode: null,
      },
      event: done ? 'complete' : 'hit',
    }
  }

  // 按错
  const base: JudgeState = {
    ...state,
    errors: state.errors + 1,
    lastWrongCode: code,
    failed: true,
    status: 'wrong',
  }
  if (options.strict) {
    // 严格：清空进度，重打本题
    return { state: { ...base, typed: [] }, event: 'miss' }
  }
  // 宽松：保留已按对的键
  return { state: base, event: 'miss' }
}

/** 退格：回退一位（严格模式判错后 typed 为空，等价于无操作） */
export function backspace(state: JudgeState): JudgeState {
  if (state.typed.length === 0) return state
  return { ...state, typed: state.typed.slice(0, -1), status: 'typing' }
}

/** 显示答案：返回本题的完整字母序列，如 ['g','r'] */
export function answerLetters(target: Encoded): string[] {
  return [...target.letters]
}
