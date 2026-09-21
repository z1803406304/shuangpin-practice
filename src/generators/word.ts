/**
 * 「词组」出题器：从 12000 个常用词语里抽（jieba 词频排序，构建期算好音节）。
 *
 * 题目是整词，逐字推进——这比单字更接近真实打字，因为要连续切换键位组合，
 * 而且能练到「词内多音字」（例如「银行」是 yin hang 不是 yin xing，
 * 音节在构建期按词语上下文算好，运行时直接用）。
 *
 * **取材范围**（词库有 1.2 万条，全上会掺进很多生僻词）：
 * - 最常用 1000 / 3000 / 6000 词：按语料词频取前 N，适合循序渐进
 * - 全部：1.2 万条，会碰到「郡县制」这种词
 * - 四字词 / 成语：1200 条四字词（含成语），是很好的节奏训练
 *
 * 抽样默认按语料词频加权（前几百个词明显更常出现，但不至于垄断）。
 * 四字词范围例外——那批词频都很低，再按词频加权只会反复出前几条，所以用均匀随机。
 */

import { capitalize, splitSyllables } from '../core/text.ts'
import { WORDS, WORD_COUNT, type WordEntry } from '../data/words.ts'
import type { Generator, GeneratorContext, Prompt, WordScope } from './types.ts'
import { buildRankPool, createRecentFilter, pickIndexByWeight } from './weights.ts'

export const WORD_SCOPES: ReadonlyArray<{ id: WordScope; name: string }> = [
  { id: 'top1000', name: '最常用 1000 词' },
  { id: 'top3000', name: '最常用 3000 词' },
  { id: 'top6000', name: '最常用 6000 词' },
  { id: 'all', name: `全部 ${WORD_COUNT} 词` },
  { id: 'idiom', name: '四字词 / 成语' },
]

const LIMITS: Record<Exclude<WordScope, 'idiom'>, number> = {
  top1000: 1000,
  top3000: 3000,
  top6000: 6000,
  all: WORDS.length,
}

export function createWordGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(10)
  let fourChar: WordEntry[] | null = null
  const pools = new Map<WordScope, number[]>()

  /** 当前范围内的词表 */
  function pool(): readonly WordEntry[] {
    const scope = context.wordScope()
    if (scope === 'idiom') {
      if (!fourChar) fourChar = WORDS.filter((entry) => [...entry.w].length === 4)
      return fourChar
    }
    return WORDS.slice(0, Math.min(LIMITS[scope] ?? WORDS.length, WORDS.length))
  }

  /** 权重池（按范围内名次加权）；四字词范围用均匀 */
  function weightsFor(scope: WordScope, size: number): number[] | null {
    if (scope === 'idiom' || context.sample() === 'uniform') return null
    let cached = pools.get(scope)
    if (!cached) {
      cached = buildRankPool(size)
      pools.set(scope, cached)
    }
    return cached
  }

  function pick(): WordEntry {
    const scope = context.wordScope()
    const list = pool()
    if (list.length === 0) return WORDS[0]
    const weights = weightsFor(scope, list.length)
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = weights
        ? list[pickIndexByWeight(weights)]
        : list[Math.floor(Math.random() * list.length)]
      if (!recent.has(entry.w)) return entry
    }
    return list[Math.floor(Math.random() * list.length)]
  }

  return {
    id: 'word',
    name: '词组',
    description: `常用词语逐字推进（词库共 ${WORD_COUNT} 条）`,
    next(): Prompt {
      const entry = pick()
      recent.push(entry.w)
      const syllables = splitSyllables(entry.s)
      const chars = [...entry.w]
      return {
        layout: 'flow',
        parts: chars.map((char, index) => ({
          display: char,
          sub: capitalize(syllables[index] ?? ''),
          syllable: syllables[index] ?? '',
        })),
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}
