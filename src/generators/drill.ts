/**
 * 「键位记忆训练」出题器：只按**一个键**的专项练习。
 *
 * 四种题型：
 * - final          韵母 -> 键      （看到 uang 要按 L）
 * - initial        声母 -> 键      （看到 zh 要按 V）
 * - split-initial  音节 -> 声母键  （看到 zhuang 只按 V，练「拆音节」）
 * - split-final    音节 -> 韵母键  （看到 zhuang 只按 L）
 * - mixed          上面四种随机
 *
 * 为什么单独做这个模式：完整音节练习里，一个字的错误无法区分
 * 「声母想不起来」还是「韵母记错了」。这个模式把两部分拆开练，
 * 配合统计里的「反应最慢的键」，能精确定位到具体哪个韵母没记住。
 *
 * 反向题（给键选韵母）没有做：答案是文字而不是按键，不适合这个打字式界面。
 * `decodeLetters()` 已经能算出每个键对应哪些韵母，将来要做选择题型可以直接用。
 *
 * ⚠️ 这里**不用「近期去重」**（其它出题器都用了）：去重会把近期出现过的选项
 * 重新抽，而选项集合越小、被压得越狠。声母池里只有 zh/ch/sh 三个多字母项，
 * 去重会让它们反而更少出现（实测占比从 47% 掉到 20%）。
 * 所以这里改成「显式权重 + 只避免连续重复同一个」。
 */

import { capitalize, displayFinal } from '../core/text.ts'
import { initialsOfKey } from '../core/schemes/xiaohe.ts'
import { SYLLABLES } from '../data/syllables.ts'
import type { DrillKind, Generator, GeneratorContext, Prompt, PromptPart } from './types.ts'
import { pickIndexByWeight } from './weights.ts'

interface KeyItem {
  label: string
  code: string
  /** 相对权重 */
  weight: number
}

export function createDrillGenerator(context: GeneratorContext): Generator {
  let lastLabel = ''

  /** 韵母 -> 键（同一个韵母只会命中一个键） */
  function finals(): KeyItem[] {
    const items: KeyItem[] = []
    for (const row of context.scheme().keyRows) {
      for (const key of row) {
        for (const final of key.finals) {
          items.push({ label: displayFinal(final), code: key.code, weight: 1 })
        }
      }
    }
    return items
  }

  /**
   * 声母 -> 键。
   * 单字母声母（b→B、p→P…）其实是送分题，但 zh/ch/sh 落在 V/I/U 上很容易记混，
   * 所以给三个双字母声母 6 倍权重，让它们占到大约一半。
   */
  function initials(): KeyItem[] {
    const items: KeyItem[] = []
    for (const row of context.scheme().keyRows) {
      for (const key of row) {
        for (const initial of initialsOfKey(key)) {
          items.push({ label: initial, code: key.code, weight: initial.length > 1 ? 6 : 1 })
        }
      }
    }
    return items
  }

  /** 有真实声母的音节（零声母音节没有「声母键」可问） */
  function splitInitials(): KeyItem[] {
    const items: KeyItem[] = []
    for (const entry of SYLLABLES) {
      const encoded = context.scheme().encode(entry.s)
      if (!encoded || !encoded.initial) continue
      items.push({ label: entry.s, code: encoded.codes[0], weight: 1 })
    }
    return items
  }

  /** 所有音节问「韵母在哪个键」：零声母音节也有韵母键（就是最后一个键） */
  function splitFinals(): KeyItem[] {
    const items: KeyItem[] = []
    for (const entry of SYLLABLES) {
      const encoded = context.scheme().encode(entry.s)
      if (!encoded) continue
      items.push({ label: entry.s, code: encoded.codes[encoded.codes.length - 1], weight: 1 })
    }
    return items
  }

  const kinds: Array<Exclude<DrillKind, 'mixed'>> = ['final', 'initial', 'split-initial', 'split-final']

  function pickFrom(pool: KeyItem[]): KeyItem {
    const weights = pool.map((item) => item.weight)
    let item = pool[pickIndexByWeight(weights)]
    // 只避免「连续两次同一个」，不做近期去重（理由见文件头注释）
    if (pool.length > 1 && item.label === lastLabel) item = pool[pickIndexByWeight(weights)]
    lastLabel = item.label
    return item
  }

  function makePart(kind: Exclude<DrillKind, 'mixed'>): PromptPart {
    const pools: Record<Exclude<DrillKind, 'mixed'>, () => KeyItem[]> = {
      final: finals,
      initial: initials,
      'split-initial': splitInitials,
      'split-final': splitFinals,
    }
    const notes: Record<Exclude<DrillKind, 'mixed'>, string> = {
      final: '这个韵母在哪个键？',
      initial: '这个声母在哪个键？',
      'split-initial': '这个音节的声母在哪个键？',
      'split-final': '这个音节的韵母在哪个键？',
    }
    const item = pickFrom(pools[kind]())
    const isSyllableQuestion = kind === 'split-initial' || kind === 'split-final'
    return {
      display: item.label,
      sub: isSyllableQuestion ? capitalize(item.label) : kind === 'final' ? '韵母' : '声母',
      codes: [item.code],
      note: notes[kind],
    }
  }

  return {
    id: 'drill',
    name: '键位记忆训练',
    description: '只按一个键的专项练习：韵母 / 声母 / 拆音节',
    next(): Prompt {
      const chosen = context.drillKind()
      const kind = chosen === 'mixed' ? kinds[Math.floor(Math.random() * kinds.length)] : chosen
      return { layout: 'single', parts: [makePart(kind)] }
    },
    reset(): void {
      lastLabel = ''
    },
  }
}
