/**
 * 「全部拼音组合」出题器：从 405 个音节里抽。
 *
 * 两种随机方式：
 * - weighted（默认）：按音节的常用度权重 w 加权（w 由真实字频表算出，见
 *   scripts/gen-syllables.mjs）。汉语音节常用度差异极大（yi 有上百个字、fiao 只有 1 个），
 *   均匀随机会让人反复遇到一辈子用不到的音节。
 * - uniform：均匀随机，用于「全组合扫一遍」的查漏补缺式练习。
 */

import { capitalize } from '../core/text.ts'
import { SYLLABLES, type SyllableEntry } from '../data/syllables.ts'
import type { Generator, GeneratorContext, Prompt } from './types.ts'
import { createRecentFilter, pickIndexByWeight } from './weights.ts'

export function createSyllableGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(12)
  let weightedPool: number[] | null = null

  function pick(): SyllableEntry {
    const weighted = context.sample() === 'weighted'
    if (weighted && !weightedPool) {
      weightedPool = SYLLABLES.map((entry) => entry.w)
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const index = weighted
        ? pickIndexByWeight(weightedPool as number[])
        : Math.floor(Math.random() * SYLLABLES.length)
      const entry = SYLLABLES[index]
      if (!recent.has(entry.s)) return entry
    }
    return SYLLABLES[Math.floor(Math.random() * SYLLABLES.length)]
  }

  return {
    id: 'syllable',
    name: '全部拼音组合',
    description: `全部拼音组合（${SYLLABLES.length} 个音节）`,
    next(): Prompt {
      const entry = pick()
      recent.push(entry.s)
      return {
        layout: 'single',
        parts: [{ display: entry.ch, sub: capitalize(entry.s), syllable: entry.s }],
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}
