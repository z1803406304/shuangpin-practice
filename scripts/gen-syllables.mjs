/**
 * 生成两个字频相关的数据文件：
 *
 * 1. src/data/syllables.ts —— 405 个音节 + 代表字 + 常用度权重
 *    · 音节覆盖：由 pinyin-pro 字典对 CJK 基本区 + 扩展 A 全量扫描得到，不会漏音节
 *    · 代表字：取该音节下**字频排名最靠前**的汉字（真实字频表，不是猜的）
 *    · 权重 w：按 Zipf 近似，字频 ≈ 1/rank，所以音节常用度 ≈ Σ(1/rank)，
 *      再归一化到 1~100。用于「常用优先」出题，避免总抽到 fiao 这种一辈子用不到的音节。
 *
 * 2. src/data/hanzi.ts —— 按频率排序的常用汉字（M4「常用汉字」模式的数据源）
 *
 * 运行：npm run gen:data
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pinyin } from 'pinyin-pro'

import { encode } from '../src/core/schemes/xiaohe.ts'
import { ROOT, ensureCharFrequency } from './sources.mjs'

/** CJK 基本区 + 扩展 A */
const RANGES = [
  [0x4e00, 0x9fff],
  [0x3400, 0x4dbf],
]

const BASIC_BLOCK_END = 0x9fff

function buildChars() {
  const chars = []
  for (const [lo, hi] of RANGES) {
    for (let cp = lo; cp <= hi; cp += 1) chars.push(String.fromCodePoint(cp))
  }
  return chars
}

/**
 * 代表字候选的排序键：越小越优先。
 * 有字频排名的字永远优先于没有排名的字；都没排名时，基本区优先于扩展 A
 * （否则会出现 㳘 这种扩展 A 生僻字因为码点小而被选中的情况）。
 */
function candidateRank(char, rankOf) {
  const freqRank = rankOf.get(char)
  if (freqRank !== undefined) return freqRank
  const isBasic = char.codePointAt(0) <= BASIC_BLOCK_END
  return (isBasic ? 100000 : 900000) + char.codePointAt(0)
}

async function main() {
  const { rankOf, ordered } = await ensureCharFrequency()
  const chars = buildChars()
  const readings = pinyin(chars.join(''), { type: 'array', toneType: 'none', v: true })
  if (readings.length !== chars.length) {
    throw new Error(`拼音数量与汉字数量不一致：${readings.length} vs ${chars.length}`)
  }

  /** @type {Map<string, {n: number, best: string, bestRank: number, score: number}>} */
  const groups = new Map()
  /** @type {Map<string, number>} */
  const rejected = new Map()

  for (let i = 0; i < chars.length; i += 1) {
    const raw = String(readings[i] ?? '').trim()
    if (!/^[a-zü]+$/i.test(raw)) continue
    const enc = encode(raw)
    if (!enc) {
      rejected.set(raw, (rejected.get(raw) ?? 0) + 1)
      continue
    }
    const char = chars[i]
    const rank = candidateRank(char, rankOf)
    const freqRank = rankOf.get(char)
    // Zipf 近似：出现频率 ≈ 1/排名。没在字频表里的字按 rank 8000 打折计入
    const contribution = 1 / (freqRank ?? 8000)

    const entry = groups.get(enc.syllable)
    if (!entry) {
      groups.set(enc.syllable, { n: 1, best: char, bestRank: rank, score: contribution })
    } else {
      entry.n += 1
      entry.score += contribution
      if (rank < entry.bestRank) {
        entry.best = char
        entry.bestRank = rank
      }
    }
  }

  const maxScore = Math.max(...[...groups.values()].map((v) => v.score))
  // 直接用 Σ(1/rank) 归一化会把动态范围拉爆（「的」独占 1.0，白/表/帮 只有 0.003），
  // 绝大多数音节会被压到 w=1，加权就退化成均匀了。所以做一次 0.4 次幂压缩，
  // 把权重区间收敛到大约 3~100，既保证常用音节明显更多，也保证生僻音节不会消失。
  const WEIGHT_EXPONENT = 0.4
  const rows = [...groups.entries()]
    .map(([s, v]) => ({
      s,
      ch: v.best,
      n: v.n,
      w: Math.max(1, Math.round(Math.pow(v.score / maxScore, WEIGHT_EXPONENT) * 100)),
      code: encode(s).letters.join(''),
    }))
    .sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : 0))

  const syllableLines = rows
    .map(
      (r) =>
        `  { s: ${JSON.stringify(r.s)}, ch: ${JSON.stringify(r.ch)}, n: ${r.n}, w: ${r.w}, code: ${JSON.stringify(r.code)} },`,
    )
    .join('\n')

  const syllablesOut = `// ⚠️ 本文件由 scripts/gen-syllables.mjs 自动生成，请勿手工修改。
// 重新生成：npm run gen:data
//
// 音节表来自 pinyin-pro 字典对 CJK 基本区 + 扩展 A 的全量扫描（共 ${chars.length} 字），
// 覆盖是「字典驱动」的，不会漏音节。
//   ch = 代表字（该音节下字频排名最靠前的汉字）
//   n  = 该音节的汉字数量
//   w  = 常用度权重 1~100（按 Σ1/字频排名 归一到 100，用于「常用优先」出题）
//   code = 小鹤双拼编码

export interface SyllableEntry {
  /** 无调音节（ü 写作 v） */
  s: string
  /** 代表字 */
  ch: string
  /** 该音节的汉字数量 */
  n: number
  /** 常用度权重 1~100 */
  w: number
  /** 小鹤双拼编码（两个字母） */
  code: string
}

export const SYLLABLES: SyllableEntry[] = [
${syllableLines}
]

/** 音节总数 */
export const SYLLABLE_COUNT = ${rows.length}
`

  mkdirSync(resolve(ROOT, 'src/data'), { recursive: true })
  writeFileSync(resolve(ROOT, 'src/data/syllables.ts'), syllablesOut, 'utf8')

  // ---- 常用汉字表（M4 用）----
  const HANZI_LIMIT = 3500
  const hanziRows = []
  for (const char of ordered) {
    const reading = pinyin(char, { toneType: 'none', v: true })
    const enc = encode(reading)
    if (!enc) continue
    hanziRows.push({ c: char, s: enc.syllable, code: enc.letters.join('') })
    if (hanziRows.length >= HANZI_LIMIT) break
  }
  const hanziLines = hanziRows
    .map((r) => `  { c: ${JSON.stringify(r.c)}, s: ${JSON.stringify(r.s)}, code: ${JSON.stringify(r.code)} },`)
    .join('\n')

  const hanziOut = `// ⚠️ 本文件由 scripts/gen-syllables.mjs 自动生成，请勿手工修改。
// 重新生成：npm run gen:data
//
// 按字频从高到低排列的常用汉字（数据源：Jun Da 现代汉语字频表），
// 供 M4「常用汉字」模式使用；只保留小鹤双拼能编码的字。

export interface HanziEntry {
  /** 汉字 */
  c: string
  /** 无调音节 */
  s: string
  /** 小鹤双拼编码 */
  code: string
}

export const HANZI: HanziEntry[] = [
${hanziLines}
]

/** 常用汉字数量 */
export const HANZI_COUNT = ${hanziRows.length}
`
  writeFileSync(resolve(ROOT, 'src/data/hanzi.ts'), hanziOut, 'utf8')

  console.log(`✅ src/data/syllables.ts：${rows.length} 个音节（扫描 ${chars.length} 个汉字）`)
  console.log(`✅ src/data/hanzi.ts：${hanziRows.length} 个常用汉字（按字频排序）`)
  if (rejected.size > 0) {
    const list = [...rejected.entries()].sort((a, b) => b[1] - a[1])
    console.log(`ℹ️  跳过 ${rejected.size} 个无法编码的边缘音节：${list.map(([s, n]) => `${s}(${n})`).join(' ')}`)
  }
  console.log('   权重最高的 12 个音节：', [...rows].sort((a, b) => b.w - a.w).slice(0, 12).map((r) => `${r.s}(${r.ch},w=${r.w})`).join(' '))
  console.log('   权重最低的 8 个音节：', [...rows].sort((a, b) => a.w - b.w).slice(0, 8).map((r) => `${r.s}(${r.ch},w=${r.w})`).join(' '))
  console.log('   常用汉字前 20：', hanziRows.slice(0, 20).map((r) => r.c).join(''))
}

main()
