/**
 * 出题器统一接口。
 *
 * 加一种练习模式 = 加一个实现这个接口的文件，
 * `generators/index.ts` 里注册一下，界面层完全不用改。
 *
 * 题面被拆成「单元（parts）」：单字题只有 1 个单元，词语 2~4 个，句子可以十几个。
 * 每个单元自己带题面显示、拼音和待输入键码。
 */

import type { Scheme } from '../core/schemes/index.ts'

/** 一个题面单元 */
export interface PromptPart {  /** 题面主显示：汉字 / 音节 / 韵母 / 键名 */
  display: string
  /** 主显示前面的标点（句子模式） */
  lead?: string
  /** 主显示后面的标点（句子模式） */
  tail?: string
  /** 副显示：拼音，或者「韵母」这类说明 */
  sub?: string
  /** 待输入音节（无调，ü 写作 v）；给了 codes 时可以省略 */
  syllable?: string
  /**
   * 直接指定要按的键码（键位记忆训练用）。
   * 给这个字段时不再走音节编码，长度可以是 1。
   */
  codes?: string[]
  /** 一句话说明这道题在问什么（键位训练模式用） */
  note?: string
}

export interface Prompt {
  parts: PromptPart[]
  /** single = 单字大图；flow = 词语/句子逐字高亮 */
  layout: 'single' | 'flow'
}

/** 出题器需要的运行时上下文（由会话层从设置里取，避免出题器直接依赖 store） */
export interface GeneratorContext {
  /** 当前双拼方案 */
  scheme: () => Scheme
  /** 随机方式 */
  sample: () => 'weighted' | 'uniform'
  /** 常用汉字模式的字频范围（前 N 个常用字） */
  hanziRange: () => number
  /** 键位记忆训练的题型 */
  drillKind: () => DrillKind
  /** 词组模式的取材范围 */
  wordScope: () => WordScope
  /** 自定义文本（已预先转好音节）；没有则返回 null */
  customParts: () => CustomTextPart[] | null
  /** 累计按错过的字（历史 + 本轮），按错误次数从高到低 */
  errorChars: () => Array<{ char: string; count: number }>
}

export type DrillKind = 'final' | 'initial' | 'split-initial' | 'split-final' | 'mixed'

/** 词组模式的取材范围 */
export type WordScope = 'top1000' | 'top3000' | 'top6000' | 'all' | 'idiom'

/** 自定义文本里的一段（音节已转好，运行时不需要 pinyin-pro） */
export interface CustomTextPart {
  char: string
  lead: string
  tail: string
  syllable: string
}

export interface Generator {
  id: string
  name: string
  /** 顶栏「模式说明」里的描述 */
  description: string
  next(): Prompt
  reset(): void
}
