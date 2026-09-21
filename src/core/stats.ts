/**
 * 练习统计（纯逻辑，不依赖 Vue / DOM）。
 *
 * 指标定义：
 * - 速度（字/分）= 打对的题数 / 有效用时；只在有实际击键的时间段内计时，
 *   长时间发呆（默认 > 5s 无击键）不计入用时，避免挂机刷低速度。
 * - 独立正确率 = 「没按错、也没用提示」的题数 / 完成题数。靠提示完成的题**不算**，
 *   否则卡住等提示也能刷出好看的准确率，指标就失去意义了。
 * - 依赖提示率 = 靠提示完成的题数 / 完成题数（自动闪键位和自己按 Tab 都算）。
 * - 按键正确率 = 正确击键 / 总击键（不受提示影响）。
 * - 键位错误热力图：按错时记到「错误的键」上（keyErrors），
 *   这比记在正确答案上更能反映「手滑按到了哪儿」。
 * - 错误字统计：按错时记到当前题目的字/音节上（charErrors），用来找「最容易错的字」。
 * - 每键反应时间：记录两次击键之间的间隔，归到刚按下的那个键上（超过 3s 视为发呆不计），
 *   用来区分「想不起来」（慢）和「手滑」（错误多但快）——这两种问题练法完全不同。
 */

export interface KeyTimeEntry {
  /** 累计毫秒 */
  total: number
  /** 采样次数 */
  count: number
}

export interface StatsSnapshot {
  /** 已完成的题数 */
  done: number
  /** 完全独立完成的题数（没按错、也没用提示） */
  independent: number
  /** 用到提示的题数（卡住自动闪键位，或自己按 Tab 看答案） */
  hinted: number
  /** 总击键数 */
  keystrokes: number
  /** 错误击键数 */
  errors: number
  /** 速度：字/分 */
  cpm: number
  /** 速度：键/分 */
  kpm: number
  /** 独立正确率 = 独立完成 / 完成题数（**不含**靠提示完成的题） */
  independentRate: number
  /** 依赖提示率 = 靠提示完成 / 完成题数 */
  hintedRate: number
  /** 按键正确率 0~1 */
  keyAccuracy: number
  /** 当前连击（连续独立完成） */
  combo: number
  /** 最长连击 */
  maxCombo: number
  /** 有效用时（毫秒） */
  elapsedMs: number
  /** 错误键码 -> 次数 */
  keyErrors: Record<string, number>
  /** 出错的字/音节 -> 次数 */
  charErrors: Record<string, number>
  /** 键码 -> 反应时间累计 */
  keyTimes: Record<string, KeyTimeEntry>
}

const IDLE_RESET_MS = 5000
/** 单次反应时间上限：超过这个值当作发呆，不计入反应时间统计 */
const REACTION_CAP_MS = 3000

export class StatsTracker {
  // 用 -1 而不是 0 表示「还没发生」：0 是合法的时间戳，
  // 用 0 当哨兵会让 t=0 的场景（尤其是测试）判断错。
  private startedAt = -1
  private lastStrokeAt = -1
  private questionAt = -1
  private idleMs = 0
  done = 0
  independent = 0
  hinted = 0
  keystrokes = 0
  errors = 0
  combo = 0
  maxCombo = 0
  keyErrors: Record<string, number> = {}
  charErrors: Record<string, number> = {}
  keyTimes: Record<string, KeyTimeEntry> = {}

  /** 本轮开始时刻（尚未开始则为 0） */
  get startTime(): number {
    return this.startedAt < 0 ? 0 : this.startedAt
  }

  /** 开始一轮练习（计时归零，等第一次击键才开始计时） */
  reset(): void {
    this.startedAt = -1
    this.lastStrokeAt = -1
    this.questionAt = -1
    this.idleMs = 0
    this.done = 0
    this.independent = 0
    this.hinted = 0
    this.keystrokes = 0
    this.errors = 0
    this.combo = 0
    this.maxCombo = 0
    this.keyErrors = {}
    this.charErrors = {}
    this.keyTimes = {}
  }

  /** 标记「新题面已显示」，下一次击键的反应时间从这里开始算 */
  markQuestion(now: number = Date.now()): void {
    this.questionAt = now
  }

  /**
   * 暂停补偿：把 pausedMs 记成发呆时间（不计入用时），
   * 并把「上次击键 / 题面显示」的时间基准推到当前时刻。
   *
   * 为什么要把基准推到现在：否则恢复后的第一次击键会看到一个巨大的间隔，
   * 既会被重复扣一次发呆时间（和 idleMs 重复），反应时间也会被算成「暂停了多久」。
   */
  shift(pausedMs: number, now: number = Date.now()): void {
    if (pausedMs > 0) this.idleMs += pausedMs
    if (this.lastStrokeAt >= 0) this.lastStrokeAt = now
    if (this.questionAt >= 0) this.questionAt = now
  }

  /** 更新计时，返回「这一次击键的反应时间」（毫秒） */
  private touch(now: number): number {
    let delta = 0
    if (this.lastStrokeAt < 0) {
      if (this.startedAt < 0) this.startedAt = now
      delta = this.questionAt >= 0 ? Math.max(0, now - this.questionAt) : 0
    } else {
      const gap = now - this.lastStrokeAt
      if (gap > IDLE_RESET_MS) this.idleMs += gap - IDLE_RESET_MS
      // 新题面出现后的第一击：反应时间从「题面显示」算起（含读题 + 回忆键位），
      // 这正是「这个键我还没记住」的信号；同一题内的后续击键则用击键间隔。
      delta = this.questionAt > this.lastStrokeAt ? Math.max(0, now - this.questionAt) : gap
    }
    this.lastStrokeAt = now
    return delta
  }

  private recordReaction(code: string, delta: number): void {
    if (delta <= 0) return
    const capped = Math.min(delta, REACTION_CAP_MS)
    const entry = this.keyTimes[code] ?? { total: 0, count: 0 }
    entry.total += capped
    entry.count += 1
    this.keyTimes[code] = entry
  }

  /** 记录一次正确击键 */
  hit(code: string, now: number = Date.now()): void {
    const delta = this.touch(now)
    this.keystrokes += 1
    this.recordReaction(code, delta)
  }

  /** 记录一次错误击键；char 传当前题目的字/音节，用于「最容易错的字」 */
  miss(code: string, char: string | null = null, now: number = Date.now()): void {
    const delta = this.touch(now)
    this.keystrokes += 1
    this.errors += 1
    this.keyErrors[code] = (this.keyErrors[code] ?? 0) + 1
    if (char) this.charErrors[char] = (this.charErrors[char] ?? 0) + 1
    this.recordReaction(code, delta)
  }

  /**
   * 完成一道题。
   * @param failed 本题过程中按错过
   * @param options.hinted 本题用到了提示（自动闪键位 / 自己按 Tab）——
   *   靠提示完成的题不计入独立正确率，也不续连击
   *
   * 用对象传参而不是位置参数：早先写成 complete(failed, hinted, now) 时，
   * 调用方很容易把时间戳传成 hinted（测试里就真发生了），语义完全错掉。
   */
  complete(failed: boolean, options: { hinted?: boolean; now?: number } = {}): void {
    const { hinted = false, now = Date.now() } = options
    this.touch(now)
    this.done += 1
    if (hinted) this.hinted += 1
    if (failed || hinted) {
      this.combo = 0
    } else {
      this.independent += 1
      this.combo += 1
      if (this.combo > this.maxCombo) this.maxCombo = this.combo
    }
  }

  elapsedMs(now: number = Date.now()): number {
    if (this.startedAt < 0) return 0
    const live = this.lastStrokeAt < 0 ? 0 : Math.max(0, now - this.lastStrokeAt - IDLE_RESET_MS)
    return Math.max(0, now - this.startedAt - this.idleMs - live)
  }

  snapshot(now: number = Date.now()): StatsSnapshot {
    const ms = this.elapsedMs(now)
    const minutes = ms / 60000
    const keyTimes: Record<string, KeyTimeEntry> = {}
    for (const [code, entry] of Object.entries(this.keyTimes)) keyTimes[code] = { ...entry }
    return {
      done: this.done,
      independent: this.independent,
      hinted: this.hinted,
      keystrokes: this.keystrokes,
      errors: this.errors,
      // 速度按「最终打对了的题数」算（每道完成的题最终都是打对的），
      // 靠提示完成的题也算 —— 它会自然拖慢速度，不需要额外惩罚。
      cpm: minutes > 0 ? this.done / minutes : 0,
      kpm: minutes > 0 ? this.keystrokes / minutes : 0,
      independentRate: this.done > 0 ? this.independent / this.done : 1,
      hintedRate: this.done > 0 ? this.hinted / this.done : 0,
      keyAccuracy: this.keystrokes > 0 ? (this.keystrokes - this.errors) / this.keystrokes : 1,
      combo: this.combo,
      maxCombo: this.maxCombo,
      elapsedMs: ms,
      keyErrors: { ...this.keyErrors },
      charErrors: { ...this.charErrors },
      keyTimes,
    }
  }
}

/** 通用的「按次数取前 N 名」 */
export function topEntries(map: Record<string, number>, limit: number): Array<{ key: string; count: number }> {
  return Object.entries(map)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
    .slice(0, limit)
}

/** 平均反应时间最慢的键；minSamples 用于过滤「只按过一次」的噪声 */
export function slowestKeys(
  keyTimes: Record<string, KeyTimeEntry>,
  limit: number,
  minSamples = 2,
): Array<{ key: string; avgMs: number; count: number }> {
  return Object.entries(keyTimes)
    .filter(([, entry]) => entry.count >= minSamples)
    .map(([key, entry]) => ({ key, avgMs: entry.total / entry.count, count: entry.count }))
    .sort((a, b) => b.avgMs - a.avgMs || (a.key < b.key ? -1 : 1))
    .slice(0, limit)
}
