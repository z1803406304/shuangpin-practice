/**
 * 生成词组与句子语料：
 *   src/data/words.ts      —— 常用词语（构建期算好每个字的音节）
 *   src/data/sentences.ts  —— 句子 / 短文（来自 corpus/sentences.txt）
 *
 * 为什么在构建期算拼音：pinyin-pro 有 300KB+，如果放进浏览器包会让首屏变大；
 * 而且多音字在「词」这一级用上下文判定更准（银行 = yin hang 而不是 yin xing）。
 * 只有「自定义文本」模式需要运行时转换，那里用动态 import 按需加载。
 *
 * 运行：npm run gen:corpus
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Converter } from 'opencc-js'
import { pinyin } from 'pinyin-pro'

import { HANZI } from '../src/data/hanzi.ts'
import { encode } from '../src/core/schemes/xiaohe.ts'
import { ROOT, download } from './sources.mjs'

const JIEBA_URL = 'https://raw.githubusercontent.com/fxsjy/jieba/master/extra_dict/dict.txt.big'

/**
 * 词组筛选参数。
 *
 * 两个质量过滤器（比单纯按词频砍重要得多）：
 * 1. **词性过滤**：jieba 词典自带词性，`nr/nrt` 是人名、`ns` 是地名、`nt` 是机构、`nz` 是其他专名。
 *    不过滤的话，第 12000 名之后会大量出现「云中鹤 / 劳德诺 / 宋青书」这类小说人名、
 *    「索马里」这类音译地名 —— 拿来练打字没有意义。
 *    注意 `i` 是成语（词典里有 4 万多条），那是很好的练习材料，**不能一起砍掉**。
 * 2. **繁简去重**：jieba 词典同时收录简繁两版且词频相同（一個/一个）。
 *    「每个字都在常用字表里」能滤掉大部分繁体，但 於/後 这类字也在常用字表里，
 *    于是 出於/落後/後人 会漏进来。用 opencc 做一次转换：如果转换结果也是候选词，
 *    说明这条是繁体重复项，丢掉。
 */
const POS_EXCLUDE = new Set(['nr', 'nrt', 'nrfg', 'ns', 'nt', 'nz'])
/** 入选池大小 */
const WORD_LIMIT = 12000
/** 普通词的词频门槛 */
const MIN_FREQ = 200
/**
 * 成语(i)单独放宽门槛：jieba 词典里成语的词频普遍很低（多在几十），
 * 用同一个 200 的门槛会把成语几乎砍光（只剩 179 条），
 * 而四字成语是很好的练习材料，所以给它一个更低的下限。
 */
const MIN_FREQ_IDIOM = 30
/**
 * 四字词（基本都是成语）预留的名额。
 * 不预留的话：成语词频低，按词频排序会全部落到 12000 名之外，
 * 结果就是「词库看着大了，但一条成语都练不到」。
 */
const QUOTA_4CHAR = 1200
/** 句子最多多少个汉字（太长的句子一屏放不下，也不适合作为一道题） */
const MAX_SENTENCE_CHARS = 26

const SIMPLIFIED = new Set(HANZI.map((h) => h.c))
const CJK = /[\u4e00-\u9fff]/

/** 把一个词切成音节；有任何一节无法编码就返回 null */
function syllablesOf(text) {
  const parts = pinyin(text, { type: 'array', toneType: 'none', v: true })
  const syllables = []
  for (const raw of parts) {
    const syllable = String(raw).trim()
    if (!syllable) continue
    const encoded = encode(syllable)
    if (!encoded) return null
    syllables.push(encoded.syllable)
  }
  return syllables.length > 0 ? syllables : null
}

async function buildWords() {
  const text = await download(JIEBA_URL, 'jieba-dict.txt')
  const toSimplified = Converter({ from: 'tw', to: 'cn' })

  /** word -> { freq, pos, length } */
  const candidates = new Map()
  const stats = { total: 0, byPos: 0, byChar: 0, traditional: 0 }

  for (const line of text.split(/\r?\n/)) {
    const first = line.indexOf(' ')
    if (first < 0) continue
    const word = line.slice(0, first)
    if (!/^[\u4e00-\u9fff]+$/.test(word)) continue
    const length = [...word].length
    if (length < 2 || length > 4) continue
    const parts = line.slice(first + 1).split(' ')
    const freq = Number(parts[0])
    const pos = parts[1] ?? ''
    if (!Number.isFinite(freq)) continue
    if (pos === 'i' ? freq < MIN_FREQ_IDIOM : freq < MIN_FREQ) continue
    stats.total += 1
    if (POS_EXCLUDE.has(pos)) {
      stats.byPos += 1
      continue
    }
    // 每个字都要在常用字表里（同时过滤掉大部分繁体字）
    if (![...word].every((ch) => SIMPLIFIED.has(ch))) {
      stats.byChar += 1
      continue
    }
    if (!candidates.has(word)) candidates.set(word, { freq, pos, length })
  }

  // 繁简去重：转换结果也是候选词 => 这条是繁体版，丢掉
  const kept = []
  for (const [word, info] of candidates) {
    const simplified = toSimplified(word)
    if (simplified !== word && candidates.has(simplified)) {
      stats.traditional += 1
      continue
    }
    kept.push({ word, ...info })
  }

  kept.sort((a, b) => b.freq - a.freq)

  // 四字词单独留配额，其余按词频填满；最后整体按词频排（四字词自然落在末尾，
  // 所以「前 N 常用词」的范围里不会突然冒出成语 —— 成语走专门的「成语」范围）
  const fourChar = kept.filter((item) => item.length === 4).slice(0, QUOTA_4CHAR)
  const others = kept.filter((item) => item.length !== 4).slice(0, Math.max(0, WORD_LIMIT - fourChar.length))
  const ordered = [...others, ...fourChar].sort((a, b) => b.freq - a.freq)

  const rows = []
  let unencodable = 0
  for (const item of ordered) {
    const syllables = syllablesOf(item.word)
    if (!syllables || syllables.length !== item.length) {
      unencodable += 1
      continue
    }
    rows.push({ w: item.word, s: syllables.join(' '), len: item.length })
  }

  const byLength = {}
  for (const row of rows) byLength[row.len] = (byLength[row.len] ?? 0) + 1
  const idioms = kept.filter((k) => k.pos === 'i').length
  const fourCharInPool = byLength[4] ?? 0

  const out = `// ⚠️ 本文件由 scripts/gen-corpus.mjs 自动生成，请勿手工修改。
// 重新生成：npm run gen:corpus
//
// 常用词语，按语料词频从高到低排列（数据源：jieba 词典）。
//
// 三道过滤：
//   1. 词性：剔除人名(nr)/地名(ns)/机构(nt)/其他专名(nz) —— 否则会混进
//      「云中鹤」「孝感市」「索马里」这类没有练习价值的词。成语(i)保留。
//   2. 繁简：用 opencc 判断繁体重复项并丢弃（一個/一个 只留简体）。
//   3. 用字：每个字都必须在常用字表里，所以生僻字组合不会进来。
// 另外给四字词（成语）留了 ${QUOTA_4CHAR} 个名额，避免它们因为词频低被挤出词库。
//
//   w = 词语（2~4 字）
//   s = 每个字的音节，空格分隔（构建期用 pinyin-pro 按词语上下文算好）

export interface WordEntry {
  /** 词语 */
  w: string
  /** 每个字的音节，空格分隔 */
  s: string
}

export const WORDS: WordEntry[] = [
${rows.map((r) => `  { w: ${JSON.stringify(r.w)}, s: ${JSON.stringify(r.s)} },`).join('\n')}
]

/** 词语数量 */
export const WORD_COUNT = ${rows.length}
`

  mkdirSync(resolve(ROOT, 'src/data'), { recursive: true })
  writeFileSync(resolve(ROOT, 'src/data/words.ts'), out, 'utf8')
  console.log(`✅ src/data/words.ts：${rows.length} 个词语`)
  console.log(`   词频 >= ${MIN_FREQ}（成语 >= ${MIN_FREQ_IDIOM}）的纯汉字 2~4 字词：${stats.total}`)
  console.log(`   其中被剔除：专有名词 ${stats.byPos}、生僻/繁体用字 ${stats.byChar}、繁体重复项 ${stats.traditional}`)
  console.log(`   全池成语 ${idioms} 条；入选的四字词 ${fourCharInPool} 条；拼音无法编码跳过 ${unencodable}`)
  console.log(`   字数分布：${JSON.stringify(byLength)}`)
  console.log(`   前 8 个：${rows.slice(0, 8).map((r) => r.w).join(' ')}`)
  console.log(`   第 3000 名附近：${rows.slice(2995, 3005).map((r) => r.w).join(' ')}`)
  console.log(`   四字词抽样：${rows.filter((r) => r.len === 4).slice(0, 12).map((r) => r.w).join(' ')}`)
  console.log(`   四字词末尾：${rows.filter((r) => r.len === 4).slice(-8).map((r) => r.w).join(' ')}`)
}

function buildSentences() {
  const source = readFileSync(resolve(ROOT, 'corpus/sentences.txt'), 'utf8')
  const rows = []
  const problems = []

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const chars = [...line].filter((ch) => CJK.test(ch))
    if (chars.length === 0) continue
    if (chars.length > MAX_SENTENCE_CHARS) {
      problems.push(`${line.slice(0, 12)}… 超过 ${MAX_SENTENCE_CHARS} 字`)
      continue
    }
    const syllables = syllablesOf(chars.join(''))
    if (!syllables || syllables.length !== chars.length) {
      problems.push(`${line.slice(0, 12)}… 有音节无法编码`)
      continue
    }
    rows.push({ t: line, s: syllables.join(' ') })
  }

  const totalChars = rows.reduce((sum, r) => sum + r.s.split(' ').length, 0)
  const out = `// ⚠️ 本文件由 scripts/gen-corpus.mjs 自动生成，请勿手工修改。
// 重新生成：npm run gen:corpus（语料源文件：corpus/sentences.txt）
//
//   t = 题面原文（标点保留，但不参与输入）
//   s = 每个汉字对应的音节，空格分隔（标点已剔除，所以数量 = t 里的汉字数）

export interface SentenceEntry {
  /** 题面原文 */
  t: string
  /** 每个汉字的音节，空格分隔 */
  s: string
}

export const SENTENCES: SentenceEntry[] = [
${rows.map((r) => `  { t: ${JSON.stringify(r.t)}, s: ${JSON.stringify(r.s)} },`).join('\n')}
]

/** 句子数量 */
export const SENTENCE_COUNT = ${rows.length}
`

  writeFileSync(resolve(ROOT, 'src/data/sentences.ts'), out, 'utf8')
  console.log(`✅ src/data/sentences.ts：${rows.length} 条句子 / 短文（共 ${totalChars} 个汉字）`)
  if (problems.length > 0) {
    console.log(`ℹ️  跳过 ${problems.length} 条：`)
    for (const p of problems.slice(0, 10)) console.log(`   ${p}`)
  }
}

await buildWords()
buildSentences()
