/**
 * 「句子 / 短文」出题器：从 corpus/sentences.txt 生成的语料里抽（65 条）。
 *
 * 题面保留标点（标点挂在相邻汉字上，只显示不输入），逐字推进。
 * 长句是最接近真实场景的练习：连续十几个字、句内切换不同键位组合，
 * 而且不会像单字那样「打完一个字可以停一下」。
 */

import { alignDisplay, capitalize, splitSyllables } from '../core/text.ts'
import { SENTENCES } from '../data/sentences.ts'
import type { Generator, GeneratorContext, Prompt } from './types.ts'
import { buildRankPool, createRecentFilter, pickIndexByWeight } from './weights.ts'

export function createSentenceGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(8)
  // 语料是按「日常短句 -> 成语 -> 键盘句 -> 短文」人工编排的，
  // 所以名次加权 = 更常抽到短句，均匀随机 = 各类型都会碰到。
  const weightedPool = buildRankPool(SENTENCES.length)
  const uniformPool = weightedPool.map(() => 1)

  function pick() {
    const pool = context.sample() === 'weighted' ? weightedPool : uniformPool
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entry = SENTENCES[pickIndexByWeight(pool)]
      if (!recent.has(entry.t)) return entry
    }
    return SENTENCES[pickIndexByWeight(pool)]
  }

  return {
    id: 'sentence',
    name: '句子 / 短文',
    description: `整句显示、逐字高亮（共 ${SENTENCES.length} 条语料）`,
    next(): Prompt {
      const entry = pick()
      recent.push(entry.t)
      const aligned = alignDisplay(entry.t, splitSyllables(entry.s))
      return {
        layout: 'flow',
        parts: aligned.map((item) => ({
          display: item.char,
          lead: item.lead,
          tail: item.tail,
          sub: capitalize(item.syllable),
          syllable: item.syllable,
        })),
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}
