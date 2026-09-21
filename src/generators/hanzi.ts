/**
 * 「常用汉字」出题器：从按字频排序的常用字表里抽。
 *
 * 与「全部拼音组合」的区别：那个是以**音节**为单位（练的是键位映射），
 * 这个是以**字**为单位（练的是看到字直接反应出键位，更接近真实打字）。
 * 范围控制用字频：Top500 全是最常用的字，Top3500 会掺进不少生僻字。
 *
 * 范围内均匀随机（不用字频加权）——因为范围本身就是频率筛选，
 * 再按频率加权会让 Top500 里的前 50 个字反复出现，练不到范围里的其它字。
 */

import { capitalize } from '../core/text.ts'
import { HANZI, type HanziEntry } from '../data/hanzi.ts'
import type { Generator, GeneratorContext, Prompt } from './types.ts'
import { createRecentFilter } from './weights.ts'

export const HANZI_RANGES = [300, 500, 1000, 2000, 3500] as const

export function createHanziGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(20)

  function pool(): readonly HanziEntry[] {
    const range = Math.min(Math.max(context.hanziRange(), 50), HANZI.length)
    return HANZI.slice(0, range)
  }

  function pick(): HanziEntry {
    const list = pool()
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const entry = list[Math.floor(Math.random() * list.length)]
      if (!recent.has(entry.c)) return entry
    }
    return list[Math.floor(Math.random() * list.length)]
  }

  return {
    id: 'hanzi',
    name: '常用汉字',
    description: `按字频排序的常用汉字（共 ${HANZI.length} 字）`,
    next(): Prompt {
      const entry = pick()
      recent.push(entry.c)
      return {
        layout: 'single',
        parts: [{ display: entry.c, sub: capitalize(entry.s), syllable: entry.s }],
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}
