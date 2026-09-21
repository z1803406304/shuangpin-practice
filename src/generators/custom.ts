/**
 * 「自定义文本」出题器：把用户粘贴的任意文本切成一题一题练。
 *
 * 关键设计：**拼音在「添加文本」的时候就转好了**，存进本地存储；
 * 出题时直接用现成的音节，不需要 pinyin-pro。
 * 这样 pinyin-pro（300KB+）可以走动态 import 按需加载，
 * 只在用户真的点「添加文本」时才下载，首屏不受影响。
 */

import { alignDisplay, capitalize } from '../core/text.ts'
import type { CustomTextPart, Generator, GeneratorContext, Prompt } from './types.ts'
import { createRecentFilter } from './weights.ts'

/** 一题最多几个字（太长的文本要切段，否则一屏放不下、也没法统计单题成绩） */
const CHUNK_SIZE = 12
/** 一题最少几个字 */
const MIN_CHUNK = 4

export function createCustomGenerator(context: GeneratorContext): Generator {
  const recent = createRecentFilter(6)

  /** 把长文本切成若干「题」（按段落/句末标点优先切） */
  function buildChunks(parts: readonly CustomTextPart[]): CustomTextPart[][] {
    const chunks: CustomTextPart[][] = []
    let current: CustomTextPart[] = []

    const flush = () => {
      if (current.length >= MIN_CHUNK || (current.length > 0 && chunks.length === 0)) chunks.push(current)
      else if (current.length > 0 && chunks.length > 0) {
        // 太短的尾巴并到上一题
        chunks[chunks.length - 1] = [...chunks[chunks.length - 1], ...current]
      }
      current = []
    }

    for (const part of parts) {
      current.push(part)
      const endsSentence = /[。！？；!?;]/.test(part.tail ?? '')
      if (current.length >= CHUNK_SIZE || (endsSentence && current.length >= MIN_CHUNK)) flush()
    }
    flush()
    return chunks.filter((chunk) => chunk.length > 0)
  }

  return {
    id: 'custom',
    name: '自定义文本',
    description: '粘贴任意文本，自动转成题目',
    next(): Prompt {
      const parts = context.customParts()
      if (!parts || parts.length === 0) {
        // 没有文本时给一个占位题，提示用户去添加
        return {
          layout: 'single',
          parts: [{ display: '无', sub: 'Wu', syllable: 'wu', note: '还没有自定义文本 —— 点「自定义文本」粘贴一段' }],
        }
      }
      const chunks = buildChunks(parts)
      let chunk = chunks[0]
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const candidate = chunks[Math.floor(Math.random() * chunks.length)]
        if (!recent.has(candidate.map((p) => p.char).join(''))) {
          chunk = candidate
          break
        }
      }
      recent.push(chunk.map((p) => p.char).join(''))
      return {
        layout: chunk.length === 1 ? 'single' : 'flow',
        parts: chunk.map((part) => ({
          display: part.char,
          lead: part.lead,
          tail: part.tail,
          sub: capitalize(part.syllable),
          syllable: part.syllable,
        })),
      }
    },
    reset(): void {
      recent.clear()
    },
  }
}

/** 把纯文本转成对齐好的 parts（供「添加文本」时调用，需要传入 pinyin-pro 的转换函数） */
export function buildCustomParts(
  text: string,
  toSyllables: (text: string) => string[],
): CustomTextPart[] {
  const syllables = toSyllables(text)
  return alignDisplay(text, syllables)
    .filter((item) => item.char && item.syllable)
    .map((item) => ({ char: item.char, lead: item.lead, tail: item.tail, syllable: item.syllable }))
}
