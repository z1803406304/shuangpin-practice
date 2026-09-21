/** 空格/回车的行为：已完成 -> 下一题；未完成 -> 清空重打。Tab -> 显示答案。 */
import { reactive, watch } from 'vue'

import type { DrillKind, WordScope } from '../generators/types.ts'

const STORAGE_KEY = 'shuangpin.settings.v1'

export interface Settings {
  /** 双拼方案 id */
  schemeId: string
  /** 题库模式 id */
  modeId: string
  /** 出题随机方式：weighted = 按常用度加权，uniform = 均匀随机 */
  sample: 'weighted' | 'uniform'
  /** 常用汉字模式的字频范围（前 N 个常用字） */
  hanziRange: number
  /** 键位记忆训练的题型 */
  drillKind: DrillKind
  /** 词组模式的取材范围（词库有 1.2 万条，全上会掺进很多生僻词） */
  wordScope: WordScope
  /** 严格模式：错键即清空重打本题 */
  strict: boolean
  /** 显示键位图 */
  showKeyMap: boolean
  /** 提示下一键（闪烁） */
  showHint: boolean
  /** 夜间模式 */
  nightMode: boolean
  /** 在键位图上叠加错误次数热力图 */
  heatmap: boolean
  /** 卡住后自动提示（默认只闪键位，不给答案） */
  autoHint: boolean
  /** 弱提示（闪下一键）的等待毫秒数 */
  hintAfterMs: number
  /** 自动显示答案的等待毫秒数；0 = 永远不自动给答案（只闪键位） */
  revealAfterMs: number
  /** 答对后自动进入下一题的延时（毫秒），0 = 手动 */
  autoNextMs: number
  /** 多长时间没输入就自动暂停（毫秒），0 = 关闭 */
  autoPauseMs: number
  /** 题面字号 */
  fontSize: 'small' | 'normal' | 'large'
  /** 按键音效 */
  soundEnabled: boolean
}

const DEFAULTS: Settings = {
  schemeId: 'xiaohe',
  modeId: 'syllable',
  sample: 'weighted',
  hanziRange: 1000,
  drillKind: 'mixed',
  wordScope: 'top3000',
  strict: true,
  showKeyMap: true,
  showHint: false,
  nightMode: false,
  heatmap: false,
  autoHint: true,
  hintAfterMs: 3000,
  revealAfterMs: 0,
  autoNextMs: 160,
  autoPauseMs: 60000,
  fontSize: 'normal',
  soundEnabled: false,
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) }
  } catch {
    return { ...DEFAULTS }
  }
}

export const settings = reactive<Settings>(load())

watch(
  settings,
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* 隐私模式下 localStorage 可能不可写，忽略 */
    }
  },
  { deep: true },
)

export function resetSettings(): void {
  Object.assign(settings, DEFAULTS)
}
