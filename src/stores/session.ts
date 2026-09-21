/**
 * 练习会话（单例 store）。
 *
 * 这是整个应用的「大脑」：把纯逻辑层（schemes / judge / stats / generators / history）
 * 和界面粘起来。所有 DOM 事件（键盘、点击键位图）都只调用这里的动作函数。
 *
 * 一「题」由若干「单元（parts）」组成：
 *   单字题 1 个单元、词语 2~4 个、句子十几个、键位训练 1 个（但只按一个键）。
 * 内部用 cursor 指向当前正在输入的单元。
 * 一「轮」是从开始练到点「结束本轮」为止，对应一条历史记录。
 */

import { computed, reactive, ref, watch } from 'vue'

import type { SessionMeta, SessionRecord } from '../core/history.ts'
import { HINT_OFF, hintProgress, stageForIdle, type HintPolicy, type HintStage } from '../core/hint.ts'
import { backspace as judgeBackspace, createJudgeState, nextExpectedCode, pressKey } from '../core/judge.ts'
import { codeToLetter } from '../core/keys.ts'
import { getScheme, type Encoded, type Scheme } from '../core/schemes/index.ts'
import {
  acceptsInput,
  reduce,
  reasonOf,
  resetsQuestionOnResume,
  shouldTick,
  type PauseReason,
  type Phase,
  type PhaseEvent,
} from '../core/session-phase.ts'
import { sound } from '../core/sound.ts'
import { StatsTracker, type StatsSnapshot } from '../core/stats.ts'
import { createGenerator, type Generator, type GeneratorContext, type Prompt, type PromptPart } from '../generators/index.ts'
import { activeCustomParts, initCustomTexts } from './customTexts.ts'
import { checkpointActive, clearActive, finalizeActive, initHistory, newRecordId, aggregatedCharErrors } from './history.ts'
import { settings } from './settings.ts'
import { openResult } from './ui.ts'

/** 一个待输入的题面单元 */
export interface Part {
  /** 题面主显示 */
  display: string
  /** 前面的标点（句子模式） */
  lead: string
  /** 后面的标点（句子模式） */
  tail: string
  /** 副显示：拼音，或「韵母」这类说明 */
  sub: string
  /** 这道题在问什么 */
  note: string
  encoded: Encoded
}

const tracker = new StatsTracker()
let advanceTimer: ReturnType<typeof setTimeout> | undefined
let hintTicker: ReturnType<typeof setInterval> | undefined
let lastActivityAt = 0
let roundId = newRecordId('round')
let roundStartedAt = Date.now()

/** 出题器上下文：把设置里的值以函数形式传进去，出题器就不用依赖 store */
function generatorContext(): GeneratorContext {
  return {
    scheme: () => getScheme(settings.schemeId),
    sample: () => settings.sample,
    hanziRange: () => settings.hanziRange,
    drillKind: () => settings.drillKind,
    wordScope: () => settings.wordScope,
    customParts: () => activeCustomParts(),
    // 历史累计的错字 + 本轮刚按错的字（还没结算也要能立刻复习）
    errorChars: () => {
      const merged = new Map<string, number>()
      for (const item of aggregatedCharErrors.value) merged.set(item.char, item.count)
      for (const [char, count] of Object.entries(liveStats.value.charErrors)) {
        merged.set(char, (merged.get(char) ?? 0) + count)
      }
      return [...merged.entries()]
        .map(([char, count]) => ({ char, count }))
        .sort((a, b) => b.count - a.count || (a.char < b.char ? -1 : 1))
    },
  }
}

let generator: Generator = createGenerator(settings.modeId, generatorContext())

export const state = reactive({
  /** 会话阶段：未开始 / 进行中 / 已暂停 */
  phase: 'idle' as Phase,
  /** 暂停原因（决定提示文案与是否重做本题） */
  pauseReason: null as PauseReason | null,
  /** 本题的全部单元 */
  parts: [] as Part[],
  /** 当前单元下标 */
  cursor: 0,
  /** 题面布局：单字大图 / 词语句子逐字高亮 */
  layout: 'single' as Prompt['layout'],
  /** 当前单元的判定状态 */
  judge: createJudgeState(),
  /** 本题是否曾经按错（跨单元的整题标记） */
  everFailed: false,
  /** 显示答案（Tab / 超时自动） */
  revealed: false,
  /** 刚按错的键码，用于闪烁 */
  flashWrong: null as string | null,
  /** 刚按对的键码，用于闪烁 */
  flashRight: null as string | null,
  /** 本题是否已完成 */
  solved: false,
  /** 距离本题上一次操作的毫秒数（等待进度条用） */
  idleMs: 0,
  /** 当前提示级别：0 无 / 1 闪键位 / 2 显示答案 */
  hintStage: 0 as HintStage,
  /** 本题是否用过提示（自动闪键位或自己按 Tab）——用过就不算独立完成 */
  hintUsed: false,
  /** 本轮已完成题数 */
  solvedTotal: 0,
  /** 本轮是否已存入历史 */
  roundSaved: false,
  /** 无法编码的音节提示（正常情况下为空） */
  warning: '',
})

export const liveStats = ref<StatsSnapshot>(tracker.snapshot())

export const currentPart = computed<Part | undefined>(() => state.parts[state.cursor])

/** 下一键应该按的键码 */
export const nextCode = computed<string | null>(() => {
  const part = currentPart.value
  if (!part || state.solved) return null
  return nextExpectedCode(state.judge, part.encoded)
})

/** 已按对的键码 */
export const typedCodes = computed<string[]>(() => (state.solved ? [] : state.judge.typed))

/** 显示答案时，还没按出来的剩余字母 */
export const remainingLetters = computed<string[]>(() => {
  const part = currentPart.value
  if (!part) return []
  return part.encoded.letters.slice(state.judge.typed.length)
})

/** 错误次数（供键位图热力图使用）：键码 -> 次数 */
export const keyErrors = computed<Record<string, number>>(() => liveStats.value.keyErrors)

/* ───────────────────────── 卡住自动提示 ───────────────────────── */

/** 当前的提示策略（设置里关掉就整体关闭） */
function currentHintPolicy(): HintPolicy {
  if (!settings.autoHint) return HINT_OFF
  return { hintAfterMs: settings.hintAfterMs, revealAfterMs: settings.revealAfterMs }
}

/** 等待进度 0~1：填满表示即将提示 */
export const hintWaitProgress = computed(() => hintProgress(state.idleMs, currentHintPolicy()))

/** 键位图是否应该闪烁下一键：常开提示键，或者已经卡到 1 级提示 */
export const showKeyHint = computed(() => settings.showHint || state.hintStage >= 1)

function stopIdleWatch(): void {
  if (hintTicker !== undefined) {
    clearInterval(hintTicker)
    hintTicker = undefined
  }
}

function tickHint(): void {
  if (state.solved) {
    stopIdleWatch()
    return
  }
  const idleMs = Date.now() - lastActivityAt
  state.idleMs = idleMs

  // 长时间没输入 -> 认定人离开了，自动暂停（并在恢复时重做本题：
  // 那段时间闪过的提示不算用户看过，否则会被误记成「依赖提示」）
  if (settings.autoPauseMs > 0 && idleMs >= settings.autoPauseMs) {
    setPhase('pause-idle')
    return
  }

  const stage = stageForIdle(idleMs, currentHintPolicy())
  if (stage === state.hintStage) return
  state.hintStage = stage
  if (stage >= 1) state.hintUsed = true
  if (stage >= 2) state.revealed = true
}

/** 重新开始「卡了多久」的计时；每次击键、换题都调用 */
function markActivity(): void {
  lastActivityAt = Date.now()
  state.idleMs = 0
  state.hintStage = 0
}

function startIdleWatch(): void {
  stopIdleWatch()
  markActivity()
  // 未开始 / 已暂停时不走提示定时器（否则「走开一会儿」会被误判成依赖提示）
  if (!shouldTick(state.phase) || !settings.autoHint) return
  hintTicker = setInterval(tickHint, 100)
}

/* ───────────────────── 开始 / 暂停状态机 ───────────────────── */

let pausedAt = 0

/** 把当前这一题恢复到「没动过」的状态（离开较久后重做本题） */
function resetCurrentQuestion(): void {
  state.cursor = 0
  state.judge = createJudgeState()
  state.everFailed = false
  state.revealed = false
  state.hintUsed = false
  state.flashWrong = null
  state.flashRight = null
  state.solved = false
  state.warning = ''
  tracker.markQuestion()
  markActivity()
}

function setPhase(event: PhaseEvent): void {
  const next = reduce(state.phase, event)
  const reason = reasonOf(event)
  const previous = state.phase
  if (next === previous && reason === null) return

  // ⚠️ 先把阶段落定，再跑副作用。
  // 副作用里有依赖 state.phase 的判断（startIdleWatch 只在 running 时启动定时器），
  // 顺序反过来会静默失效 —— 表现就是「开始后卡住提示不再触发」，
  // 而纯函数 reduce 的单测发现不了这种顺序错误（只有端到端能抓到）。
  state.phase = next

  if (next === 'paused' && previous !== 'paused') {
    state.pauseReason = reason
    pausedAt = Date.now()
    clearAdvanceTimer()
    stopIdleWatch()
    checkpoint()
  }

  if (next === 'running' && previous !== 'running') {
    // 暂停时长补进发呆时间：既不计入用时，也不会被算成反应时间
    if (pausedAt > 0) tracker.shift(Date.now() - pausedAt)
    const reasonBefore = state.pauseReason
    pausedAt = 0
    state.pauseReason = null
    if (state.solved) {
      // 暂停前那题已经答完，直接出下一题
      nextQuestion()
    } else if (resetsQuestionOnResume(reasonBefore)) {
      resetCurrentQuestion()
      startIdleWatch()
    } else {
      tracker.markQuestion()
      markActivity()
      startIdleWatch()
    }
  }

  if (next === 'idle') {
    state.pauseReason = null
    pausedAt = 0
  }
}

/** 开始或继续（空格 / 回车 / 点按钮都走这里） */
export function startOrResume(): void {
  setPhase(state.phase === 'paused' ? 'resume' : 'start')
  // 从暂停/未开始恢复到进行中时，如果本题早就答完了就换下一题
  if (state.phase === 'running' && state.solved) nextQuestion()
}

/** 暂停（手动 / 切走标签页 / 长时间没动） */
export function pauseRound(reason: Exclude<PauseReason, null> = 'manual'): void {
  if (state.phase !== 'running') return
  setPhase(reason === 'manual' ? 'pause-manual' : reason === 'tab-hidden' ? 'pause-tab-hidden' : 'pause-idle')
}

/** 暂停 <-> 继续 的切换（Esc / 动作栏按钮） */
export function togglePause(): void {
  if (state.phase === 'running') pauseRound('manual')
  else startOrResume()
}

/* ──────────────────────────────────────────────────────────── */

function refreshStats(): void {
  liveStats.value = tracker.snapshot()
}

function clearAdvanceTimer(): void {
  if (advanceTimer !== undefined) {
    clearTimeout(advanceTimer)
    advanceTimer = undefined
  }
}

function playSound(kind: 'hit' | 'miss' | 'complete'): void {
  if (!settings.soundEnabled) return
  if (kind === 'hit') sound.hit()
  else if (kind === 'miss') sound.miss()
  else sound.complete()
}

/** 把出题器给的一个题面单元转成可判定的单元 */
function buildPart(part: PromptPart, scheme: Scheme): Part | null {
  let encoded: Encoded | null = null

  if (part.codes && part.codes.length > 0) {
    // 键位记忆训练：直接给定要按的键（可能只有 1 个）
    encoded = {
      syllable: part.display,
      initial: '',
      final: '',
      codes: part.codes,
      letters: part.codes.map((code) => codeToLetter(code)),
      zeroInitial: false,
    }
  } else if (part.syllable) {
    encoded = scheme.encode(part.syllable)
  }

  if (!encoded || encoded.codes.length === 0) return null
  return {
    display: part.display,
    lead: part.lead ?? '',
    tail: part.tail ?? '',
    sub: part.sub ?? '',
    note: part.note ?? '',
    encoded,
  }
}

/** 本轮记录的元信息 */
function currentMeta(endedAt = Date.now()): SessionMeta {
  const scheme = getScheme(settings.schemeId)
  return {
    id: roundId,
    startedAt: tracker.startTime || roundStartedAt,
    endedAt,
    schemeId: scheme.id,
    schemeName: scheme.name,
    modeId: settings.modeId,
    modeName: generator.name,
  }
}

/** 把出题器给出的题目装载进来（无法编码的单元会被跳过） */
function loadPrompt(prompt: Prompt, guard = 0): void {
  const scheme = getScheme(settings.schemeId)
  const parts: Part[] = []
  const skipped: string[] = []

  for (const raw of prompt.parts) {
    const part = buildPart(raw, scheme)
    if (part) parts.push(part)
    else skipped.push(raw.display || raw.syllable || '?')
  }

  if (parts.length === 0 && guard < 5) {
    loadPrompt(generator.next(), guard + 1)
    return
  }

  state.parts = parts
  state.cursor = 0
  state.layout = prompt.layout
  state.judge = createJudgeState()
  state.everFailed = false
  state.revealed = false
  state.flashWrong = null
  state.flashRight = null
  state.solved = false
  state.hintUsed = false
  state.warning =
    skipped.length > 0 ? `${skipped.join('、')} 无法用${scheme.name}编码，已跳过` : ''
  tracker.markQuestion()
  startIdleWatch()
}

/** 开启新一轮（清空统计，但保留历史） */
function beginRound(): void {
  clearAdvanceTimer()
  stopIdleWatch()
  roundId = newRecordId('round')
  roundStartedAt = Date.now()
  tracker.reset()
  state.solvedTotal = 0
  state.roundSaved = false
  clearActive()
  refreshStats()
}

/** 把当前进度写进 localStorage 的「进行中」快照（关页面也不丢） */
export function checkpoint(): void {
  if (tracker.done === 0) return
  checkpointActive(liveStats.value, currentMeta())
}

/** 结束当前一轮并结算成历史记录 */
export function finishRound(showPanel = true): SessionRecord | null {
  const snapshot = tracker.snapshot()
  if (snapshot.done === 0) {
    beginRound()
    loadPrompt(generator.next())
    return null
  }
  const { record, saved } = finalizeActive(snapshot, currentMeta())
  state.roundSaved = saved
  beginRound()
  loadPrompt(generator.next())
  if (saved && settings.soundEnabled) sound.finish()
  if (showPanel) openResult(record, saved)
  return record
}

/** 开始/重开一轮练习（上一轮有内容就静默结算，避免切模式丢记录） */
export function startSession(): void {
  clearAdvanceTimer()
  const snapshot = tracker.snapshot()
  if (snapshot.done > 0) finalizeActive(snapshot, currentMeta())
  // 回到「未开始」：题面先显示出来，等用户准备好了再按空格开始
  setPhase('restart')
  generator = createGenerator(settings.modeId, generatorContext())
  generator.reset()
  beginRound()
  loadPrompt(generator.next())
}

/** 下一题（保留统计） */
export function nextQuestion(): void {
  clearAdvanceTimer()
  loadPrompt(generator.next())
}

function flash(code: string, kind: 'wrong' | 'right'): void {
  if (kind === 'wrong') {
    state.flashWrong = code
    setTimeout(() => {
      if (state.flashWrong === code) state.flashWrong = null
    }, 300)
  } else {
    state.flashRight = code
    setTimeout(() => {
      if (state.flashRight === code) state.flashRight = null
    }, 180)
  }
}

function onPartDone(): void {
  const isLast = state.cursor >= state.parts.length - 1
  if (!isLast) {
    state.cursor += 1
    state.judge = createJudgeState()
    tracker.markQuestion()
    markActivity()
    return
  }

  stopIdleWatch()
  state.solved = true
  state.solvedTotal += 1
  // 靠提示完成的题不计入独立正确率
  tracker.complete(state.everFailed, { hinted: state.hintUsed })
  refreshStats()
  checkpoint()
  playSound('complete')

  if (settings.autoNextMs > 0) {
    clearAdvanceTimer()
    advanceTimer = setTimeout(() => nextQuestion(), settings.autoNextMs)
  }
}

/** 处理一次按键（键码来自 KeyboardEvent.code） */
export function pressCode(code: string): void {
  // 未开始 / 已暂停：不接收练习输入（避免把准备阶段的误触记成错误）
  if (!acceptsInput(state.phase)) return
  const part = currentPart.value
  if (!part || state.solved) return

  markActivity()
  state.revealed = false
  const result = pressKey(state.judge, code, part.encoded, { strict: settings.strict })
  state.judge = result.state

  if (result.event === 'ignored') return

  if (result.event === 'miss') {
    state.everFailed = true
    // 错误记在「按错的那个键」和「当前这个题面」上
    tracker.miss(code, part.display || part.encoded.syllable)
    flash(code, 'wrong')
    playSound('miss')
    refreshStats()
    return
  }

  tracker.hit(code)
  flash(code, 'right')
  playSound('hit')
  if (result.event === 'complete') onPartDone()
  refreshStats()
}

/** 空格 / 回车：未开始或已暂停 -> 开始/继续；已完成 -> 下一题；未完成 -> 清空重打本题 */
export function spaceOrEnter(): void {
  if (!acceptsInput(state.phase)) {
    startOrResume()
    return
  }
  if (state.solved) {
    nextQuestion()
    return
  }
  clearAdvanceTimer()
  markActivity()
  state.judge = createJudgeState()
  state.revealed = false
  state.flashWrong = null
  state.flashRight = null
}

/** 退格：回退一键 */
export function backspaceKey(): void {
  if (!acceptsInput(state.phase) || state.solved) return
  markActivity()
  state.judge = judgeBackspace(state.judge)
}

/** Tab：显示/隐藏答案。看过答案就算用过提示，不计入独立正确率 */
export function toggleReveal(): void {
  if (!acceptsInput(state.phase)) return
  state.revealed = !state.revealed
  if (state.revealed) state.hintUsed = true
  markActivity()
}

/** 初始化：读历史 + 读自定义文本 + 装载第一题 */
export function initSession(): void {
  initHistory()
  initCustomTexts()
  startSession()
}

// 切换方案 / 题库模式时重开一轮（上一轮会自动结算进历史）
watch(
  () => [settings.modeId, settings.schemeId] as const,
  () => startSession(),
)
// 只影响出题的设置：换题库即可，不用重开一轮；但要立刻换题，否则改了没反应
watch(
  () => [settings.sample, settings.hanziRange, settings.drillKind, settings.wordScope] as const,
  () => {
    generator.reset()
    nextQuestion()
  },
)
// 改了提示配置就重新计时，避免拿着旧阈值继续等
watch(
  () => [settings.autoHint, settings.hintAfterMs, settings.revealAfterMs] as const,
  () => {
    if (!state.solved) startIdleWatch()
  },
)

export { generator }

/** 开发期调试钩子用（生产构建不会包含） */
export const session = {
  state,
  liveStats,
  currentPart,
  nextCode,
  typedCodes,
  keyErrors,
  hintWaitProgress,
  showKeyHint,
  pressCode,
  spaceOrEnter,
  backspaceKey,
  toggleReveal,
  startOrResume,
  pauseRound,
  togglePause,
  nextQuestion,
  startSession,
  finishRound,
  checkpoint,
  get generator() {
    return generator
  },
  get tracker() {
    return tracker
  },
}
