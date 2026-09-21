/**
 * 用**官方小鹤码表**交叉验证本项目的双拼编码器。
 *
 * 原理：小鹤音形主码表里每行是「字/词 + 编码」，编码的前两位就是双拼部分
 * （后面是形码）。所以对每个单字，把官方编码的前两位跟我们的编码器结果对比，
 * 就能逐字验证覆盖几万个汉字——比自己抄键位图可靠得多。
 *
 * 处理细节：
 * - 简码（编码只有 1 位，如 啊->a、我->w、是->u）无法反推双拼，跳过；
 * - 多音字：只要官方编码匹配其中**任意一个**读音即算通过；
 * - 字典里没有读音的字（生僻/异体）跳过。
 *
 * 运行：node scripts/verify-against-flypy.mjs
 */

import { pinyin } from 'pinyin-pro'
import { encode, decodeLetters } from '../src/core/schemes/xiaohe.ts'
import { ensureFlypyTable } from './fetch-flypy-table.mjs'

const text = await ensureFlypyTable()
const lines = text.split(/\r?\n/).filter((l) => l && !l.startsWith('---config'))

/** 字 -> 官方编码集合 */
const official = new Map()
for (const line of lines) {
  const tab = line.indexOf('\t')
  if (tab === -1) continue
  const word = line.slice(0, tab)
  const code = line.slice(tab + 1).trim()
  if ([...word].length !== 1) continue // 只验证单字
  if (!/^[a-z]+$/.test(code)) continue
  if (!official.has(word)) official.set(word, new Set())
  official.get(word).add(code)
}

let checked = 0
let passed = 0
let skippedShort = 0
let skippedUnknown = 0
const mismatches = []

for (const [char, codes] of official) {
  // 简码：编码长度 1 的条目反推不出双拼（如 啊->a）
  const usable = [...codes].filter((c) => c.length >= 2)
  if (usable.length === 0) {
    skippedShort += 1
    continue
  }
  const readings = pinyin(char, { multiple: true, toneType: 'none', v: true })
    .split(/\s+/)
    .filter(Boolean)
    .map((r) => r.replace(/[^a-z]/g, ''))
  const encodings = readings.map((r) => encode(r)).filter(Boolean)
  if (encodings.length === 0) {
    skippedUnknown += 1
    continue
  }
  checked += 1
  const mine = new Set(encodings.map((e) => e.letters.join('')))
  const theirs = new Set(usable.map((c) => c.slice(0, 2)))
  const hit = [...theirs].some((t) => mine.has(t))
  if (hit) {
    passed += 1
  } else {
    mismatches.push({ char, official: [...theirs].join('/'), mine: [...mine].join('/'), readings: readings.join('/') })
  }
}

console.log('=== 与官方小鹤码表交叉验证 ===')
console.log(`参与验证单字：${checked}   通过：${passed}   不一致：${mismatches.length}`)
console.log(`跳过：简码 ${skippedShort} 个，字典无读音 ${skippedUnknown} 个`)
const rate = checked > 0 ? ((passed / checked) * 100).toFixed(3) : '0'
console.log(`一致率：${rate}%`)

if (mismatches.length > 0) {
  console.log('\n不一致明细（最多 60 条）：')
  console.log('  说明：官方=官方码(解码出的音节)  我们=我们的编码(读音)')
  for (const m of mismatches.slice(0, 60)) {
    const dec = [...m.official.split('/')]
      .map((c) => `${c}(${decodeLetters(c).join('|') || '?'})`)
      .join('/')
    console.log(`  ${m.char}  官方=${dec}  我们=${m.mine}(${m.readings})`)
  }
  const byOfficial = new Map()
  for (const m of mismatches) {
    for (const o of m.official.split('/')) byOfficial.set(o, (byOfficial.get(o) ?? 0) + 1)
  }
  console.log('\n按官方编码聚合：')
  console.log(
    '  ' +
      [...byOfficial.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k}:${v}`)
        .join('  '),
  )
}
