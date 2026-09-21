/**
 * 题库模式注册表 + 出题器工厂。
 *
 * 加一种模式只需要：写一个 createXxx(context) 文件，然后在这里登记。
 * `option` 字段告诉顶栏这个模式需要额外显示哪个设置控件。
 */

import { createCustomGenerator } from './custom.ts'
import { createDrillGenerator } from './drill.ts'
import { createHanziGenerator, HANZI_RANGES } from './hanzi.ts'
import { createReviewGenerator } from './review.ts'
import { createSentenceGenerator } from './sentence.ts'
import { createSyllableGenerator } from './syllable.ts'
import { createWordGenerator, WORD_SCOPES } from './word.ts'
import type { Generator, GeneratorContext } from './types.ts'

export interface ModeInfo {
  id: string
  name: string
  description: string
  /** 顶栏需要额外显示的设置控件 */
  option?: 'hanziRange' | 'drillKind' | 'customText' | 'wordScope'
}

export const MODES: readonly ModeInfo[] = [
  { id: 'syllable', name: '全部拼音组合', description: '405 个音节随机，练键位映射' },
  { id: 'hanzi', name: '常用汉字', description: '按字频排序的常用字，看得字出键位', option: 'hanziRange' },
  { id: 'word', name: '词组', description: '常用词语逐字推进，练连续切换', option: 'wordScope' },
  { id: 'sentence', name: '句子 / 短文', description: '整句显示、逐字高亮，最接近真实打字' },
  { id: 'custom', name: '自定义文本', description: '粘贴自己的文本练', option: 'customText' },
  { id: 'drill', name: '键位记忆训练', description: '只按一个键：韵母 / 声母 / 拆音节', option: 'drillKind' },
  { id: 'review', name: '易错复习', description: '只练你按错过的字，按错误次数排序' },
]

export const DRILL_KINDS = [
  { id: 'mixed', name: '混合（四种随机）' },
  { id: 'final', name: '韵母 → 键' },
  { id: 'initial', name: '声母 → 键' },
  { id: 'split-initial', name: '音节 → 声母键' },
  { id: 'split-final', name: '音节 → 韵母键' },
] as const

export { HANZI_RANGES, WORD_SCOPES }

export function createGenerator(modeId: string, context: GeneratorContext): Generator {
  switch (modeId) {
    case 'hanzi':
      return createHanziGenerator(context)
    case 'word':
      return createWordGenerator(context)
    case 'sentence':
      return createSentenceGenerator(context)
    case 'custom':
      return createCustomGenerator(context)
    case 'drill':
      return createDrillGenerator(context)
    case 'review':
      return createReviewGenerator(context)
    case 'syllable':
    default:
      return createSyllableGenerator(context)
  }
}

export function getMode(modeId: string): ModeInfo {
  return MODES.find((m) => m.id === modeId) ?? MODES[0]
}

export type { Generator, GeneratorContext, Prompt, PromptPart, DrillKind, CustomTextPart, WordScope } from './types.ts'
