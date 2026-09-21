/**
 * 题面文本处理（纯函数）。
 *
 * 用途：词组 / 句子模式里，题面原文带着标点，而输入只需要汉字的双拼码。
 * 所以要把「原文」和「音节序列」对齐：遇到汉字就取下一个音节，
 * 遇到标点就挂到前一个汉字的 tail 上（不参与输入，但照原样显示）。
 */

/** 汉字判定（基本区 + 扩展 A + 兼容区） */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export interface AlignedPart {
  /** 汉字（理论上不会是空串，除非整段没有汉字） */
  char: string
  /** 该汉字前面的非汉字字符（标点/空格） */
  lead: string
  /** 该汉字后面的非汉字字符（标点/空格） */
  tail: string
  /** 对应音节；音节不够时为空串 */
  syllable: string
}

/** 'xue xi' -> ['xue', 'xi'] */
export function splitSyllables(text: string | undefined | null): string[] {
  if (!text) return []
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 把题面原文与音节序列对齐。
 * @example alignDisplay('今天很好。', ['jin','tian','hen','hao'])
 *   -> [{char:'今',...},{char:'天',...},{char:'很',...},{char:'好',tail:'。',...}]
 */
export function alignDisplay(text: string, syllables: readonly string[]): AlignedPart[] {
  const out: AlignedPart[] = []
  let index = 0
  let pendingLead = ''

  for (const ch of text) {
    if (CJK.test(ch)) {
      out.push({ char: ch, lead: pendingLead, tail: '', syllable: syllables[index] ?? '' })
      pendingLead = ''
      index += 1
    } else if (out.length > 0) {
      out[out.length - 1].tail += ch
    } else {
      pendingLead += ch
    }
  }

  // 整段没有汉字时，返回一个只有标点的条目，调用方据此跳过
  if (out.length === 0 && text) {
    out.push({ char: '', lead: text, tail: '', syllable: '' })
  }
  return out
}

/** 统计一段文本里有多少个汉字 */
export function countHanzi(text: string): number {
  let count = 0
  for (const ch of text) if (CJK.test(ch)) count += 1
  return count
}

/** 取文本前 N 个字符做名字（用于自定义文本的自动命名） */
export function shortLabel(text: string, limit = 12): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}…`
}

/** 音节首字母大写，用于题面拼音显示：chen -> Chen */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** 展示用的韵母写法：内部把 ü 记作 v，显示时还原 */
export function displayFinal(final: string): string {
  return final.replace(/v/g, 'ü')
}
