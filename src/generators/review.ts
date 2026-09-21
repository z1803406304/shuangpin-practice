/**
 * 「易错复习」出题器：只练按错过的字。
 *
 * 数据来源是历史记录里累计的 charErrors（按出错次数合并），
 * 再叠加**本轮**刚按错的字（还没结算的也要能立刻复习）。
 *
 * 字 -> 音节 的映射不单独生成数据文件：直接从已有的几份数据源
 * （音节表代表字 / 常用字表 / 词组 / 句子）现场建一张表，
 * 因为这些正是练习题目可能出现的全部来源，覆盖率天然是 100%。
 */

import { capitalize } from '../core/text.ts'
import { HANZI } from '../data/hanzi.ts'
import { SENTENCES } from '../data/sentences.ts'
import { SYLLABLES } from '../data/syllables.ts'
import { WORDS } from '../data/words.ts'
import type { Generator, GeneratorContext, Prompt } from './types.ts'
import { createRecentFilter } from './weights.ts'

/** 一次最多复习多少个不同的错字（太少会老是重复，太多就失去「重点」意义） */
const MAX_POOL = 60

let charMap: Map<string, string> | null = null

/** 汉字 -> 音节；数据源覆盖了所有可能出现在题目里的字 */
function buildCharMap(): Map<string, string> {
  if (charMap) return charMap
  const map = new Map<string, string>()

  // 音节表的代表字
  for (const entry of SYLLABLES) {
    if (entry.ch) map.set(entry.ch, entry.s)
  }
  // 常用字表
  for (const entry of HANZI) {
    if (!map.has(entry.c)) map.set(entry.c, entry.s)
  }
  // 词组
  for (const entry of WORDS) {
    const chars = [...entry.w]
    const syllables = entry.s.split(/\s+/)
    chars.forEach((char, index) => {
      const syllable = syllables[index]
      if (char && syllable && !map.has(char)) map.set(char, syllable)
    })
  }
  // 句子（音节只对应汉字，标点跳过）
  for (const entry of SENTENCES) {
    const syllables = entry.s.split(/\s+/)
    let index = 0
    for (const char of entry.t) {
      if (!/[\u4e00-\u9fff]/.test(char)) continue
      const syllable = syllables[index]
      if (syllable && !map.has(char)) map.set(char, syllable)
      index += 1
    }
  }

  charMap = map
  return map
}

/** 供测试与调试用：某个字对应的音节 */
export function syllableOfChar(char: string): string | undefined {
  return buildCharMap().get(char)
}

export function createReviewGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(10)

  return {
    id: 'review',
    name: '易错复习',
    description: '只练你按错过的字（按错误次数排序，取前 60 个）',
    next(): Prompt {
      const errors = context.errorChars()
      const map = buildCharMap()
      const pool = errors
        .filter((item) => map.has(item.char))
        .slice(0, MAX_POOL)
        .map((item) => ({ char: item.char, syllable: map.get(item.char) as string, count: item.count }))

      if (pool.length === 0) {
        return {
          layout: 'single',
          parts: [
            {
              display: '无',
              sub: 'Wu',
              syllable: 'wu',
              note:
                errors.length === 0
                  ? '还没有错题记录 —— 先练几轮，这里会自动收集你按错的字'
                  : '记录里的字都不在题库范围内，先去别的模式练几轮',
            },
          ],
        }
      }

      // 出错次数越多越优先，但不要每次都出同一个字
      const weights = pool.map((item) => item.count)
      let picked = pool[0]
      for (let attempt = 0; attempt < 15; attempt += 1) {
        let total = 0
        for (const w of weights) total += w
        let ticket = Math.random() * total
        let index = 0
        for (let i = 0; i < pool.length; i += 1) {
          ticket -= weights[i]
          if (ticket <= 0) {
            index = i
            break
          }
        }
        const candidate = pool[index]
        if (!recent.has(candidate.char)) {
          picked = candidate
          break
        }
        picked = candidate
      }
      recent.push(picked.char)

      return {
        layout: 'single',
        parts: [
          {
            display: picked.char,
            sub: capitalize(picked.syllable),
            syllable: picked.syllable,
            note: `这个字你按错过 ${picked.count} 次`,
          },
        ],
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}
