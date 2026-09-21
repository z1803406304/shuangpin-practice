/**
 * 数据文件质量测试：确保生成出来的音节表 / 常用字表是「讲道理」的。
 * 这些断言能在数据源换了、权重公式改坏了、代表字挑错了的时候第一时间报警。
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Converter } from 'opencc-js'

import { encode } from '../src/core/schemes/xiaohe.ts'
import { SYLLABLES } from '../src/data/syllables.ts'
import { HANZI, HANZI_COUNT } from '../src/data/hanzi.ts'
import { WORDS, WORD_COUNT } from '../src/data/words.ts'
import { SENTENCES, SENTENCE_COUNT } from '../src/data/sentences.ts'

test('音节表：权重合法、代表字是汉字、编码自洽', () => {
  const problems = []
  for (const row of SYLLABLES) {
    if (!Number.isInteger(row.w) || row.w < 1 || row.w > 100) problems.push(`${row.s}: 权重非法 ${row.w}`)
    if (!row.ch || [...row.ch].length !== 1) problems.push(`${row.s}: 代表字非法 ${JSON.stringify(row.ch)}`)
    if (row.w !== 100) continue
    problems.push(`${row.s}: 意外出现多个权重 100 的音节`)
  }
  // 归一化后权重最高的应当是排名第一的那个音节，只允许一个 100
  const hundreds = SYLLABLES.filter((r) => r.w === 100)
  assert.equal(hundreds.length, 1, `权重 100 的音节应当只有 1 个，实际 ${hundreds.length} 个`)
  assert.deepEqual(problems.filter((p) => !p.includes('意外出现多个')), [])
})

test('音节表：常用度排序符合语言事实（的/一/是 必须最靠前）', () => {
  const top = [...SYLLABLES].sort((a, b) => b.w - a.w).slice(0, 8).map((r) => r.s)
  for (const expected of ['de', 'yi', 'shi']) {
    assert.ok(top.includes(expected), `「${expected}」应当排在最常用的音节里，实际前 8 是：${top.join(' ')}`)
  }
  // 生僻音节权重必须明显低于常用音节
  const rare = SYLLABLES.find((r) => r.s === 'dia')
  const common = SYLLABLES.find((r) => r.s === 'shi')
  assert.ok(rare && common && rare.w < common.w / 5, '生僻音节权重应当远低于常用音节')
})

test('音节表：常用音节的代表字必须是常用字（防止挑到生僻字当题面）', () => {
  const bySyllable = new Map(SYLLABLES.map((r) => [r.s, r]))
  // 陈 = chen，截图里的题面用例
  assert.equal(bySyllable.get('chen')?.ch, '陈')
  assert.equal(bySyllable.get('de')?.ch, '的')
  assert.equal(bySyllable.get('yi')?.ch, '一')
  assert.equal(bySyllable.get('shi')?.ch, '是')
  // 代表字的拼音必须真的是这个音节
  const problems = []
  for (const row of SYLLABLES) {
    const enc = encode(row.s)
    if (!enc) problems.push(`${row.s}: 无法编码`)
  }
  assert.deepEqual(problems, [])
})

test('词库：条数、字数分布与编码自洽', () => {
  assert.equal(WORDS.length, WORD_COUNT)
  assert.ok(WORD_COUNT >= 12000, `词库应该有一万条以上，实际 ${WORD_COUNT}`)
  assert.equal(new Set(WORDS.map((w) => w.w)).size, WORDS.length, '词库里不应有重复词')

  const byLength = {}
  for (const row of WORDS) byLength[[...row.w].length] = (byLength[[...row.w].length] ?? 0) + 1
  assert.ok(byLength[2] > 8000, `二字词应该占大头，实际 ${byLength[2]}`)
  assert.ok(byLength[4] >= 1000, `四字词（成语）有独立配额，不该低于 1000，实际 ${byLength[4]}`)

  // 每个词的音节数必须等于字数，且每节都能编码
  const problems = []
  for (const row of WORDS) {
    const chars = [...row.w]
    const syllables = row.s.split(/\s+/)
    if (syllables.length !== chars.length) {
      problems.push(`${row.w}: 音节数 ${syllables.length} != 字数 ${chars.length}`)
      continue
    }
    for (const syllable of syllables) {
      if (!encode(syllable)) problems.push(`${row.w}: 音节 ${syllable} 无法编码`)
    }
  }
  assert.deepEqual(problems.slice(0, 10), [], `\n${problems.slice(0, 10).join('\n')}\n（共 ${problems.length} 条）`)
})

test('词库：专有名词已被词性过滤掉（人名/地名/机构/音译）', () => {
  const wordSet = new Set(WORDS.map((w) => w.w))
  // 这些是过滤前真实混进候选池的样本，锁成回归测试
  const shouldBeGone = ['袁世凯', '孝感市', '黄冈市', '东交民巷', '搜狗', '索马里', '云中鹤', '劳德诺', '宋青书', '中华人民共和国']
  const leaked = shouldBeGone.filter((w) => wordSet.has(w))
  assert.deepEqual(leaked, [], `这些专有名词不该出现在词库里：${leaked.join('、')}`)
})

test('词库：没有简繁重复项（一词只保留简体那一版）', () => {
  const t2s = Converter({ from: 'tw', to: 'cn' })
  const wordSet = new Set(WORDS.map((w) => w.w))
  const problems = []
  for (const { w } of WORDS) {
    const simplified = t2s(w)
    // 注意不能直接要求「转换后等于自己」：opencc 的台湾词库会把「著」转成「着」，
    // 于是 显著/著称/专著/土著 这 4 个正确的简体词会被误判。
    // 真正的不变量是：简体对应词不能同时也在词库里（那就是简繁重复项）。
    if (simplified !== w && wordSet.has(simplified)) problems.push(`${w} / ${simplified}`)
  }
  assert.deepEqual(problems.slice(0, 10), [], `词库里同时有简繁两版：\n${problems.slice(0, 10).join('\n')}`)
  // 简体版本本身应该在
  assert.ok(wordSet.has('一个'), '简体「一个」应该在词库里')
  assert.ok(!wordSet.has('一個'), '繁体「一個」不该在词库里')
})

test('句子语料：条数、汉字数与音节数一致，且都能编码', () => {
  assert.equal(SENTENCES.length, SENTENCE_COUNT)
  assert.ok(SENTENCE_COUNT >= 300, `句子语料偏少：${SENTENCE_COUNT}`)
  const problems = []
  for (const entry of SENTENCES) {
    const hanziCount = [...entry.t].filter((ch) => /[\u4e00-\u9fff]/.test(ch)).length
    const syllables = entry.s.split(/\s+/)
    if (hanziCount !== syllables.length) {
      problems.push(`${entry.t}: 汉字 ${hanziCount} != 音节 ${syllables.length}`)
      continue
    }
    for (const syllable of syllables) {
      if (!encode(syllable)) problems.push(`${entry.t}: 音节 ${syllable} 无法编码`)
    }
  }
  assert.deepEqual(problems.slice(0, 10), [], `\n${problems.slice(0, 10).join('\n')}`)
})

test('句子语料：只用常用字，且常用字覆盖率不能回落', () => {
  const common = new Set(HANZI.map((h) => h.c))
  const covered = new Set()
  const rareHits = []
  for (const entry of SENTENCES) {
    for (const ch of entry.t) {
      if (!/[\u4e00-\u9fff]/.test(ch)) continue
      if (!common.has(ch)) rareHits.push(`${ch}（见「${entry.t.slice(0, 10)}…」）`)
      covered.add(ch)
    }
  }
  assert.deepEqual(rareHits.slice(0, 10), [], `句子语料里不该有非常用字：\n${rareHits.slice(0, 10).join('\n')}`)

  /*
   * 覆盖率回归护栏。
   * 语料的价值不只是条数 —— 最常用的一批字如果在句子模式里永远练不到，
   * 语料就白写了。踩过的坑：最初 65 条语料只覆盖了前 500 常用字的 37%。
   * 现在（335 条 / 3516 汉字）是 98% / 71%，所以把下限锁在 95% / 68%。
   */
  const cover = (band) => HANZI.slice(0, band).filter((h) => covered.has(h.c)).length / band
  const top500 = cover(500)
  const top1000 = cover(1000)
  assert.ok(top500 >= 0.95, `前 500 常用字覆盖率跌到 ${(top500 * 100).toFixed(0)}%，要求 ≥95%`)
  assert.ok(top1000 >= 0.68, `前 1000 常用字覆盖率跌到 ${(top1000 * 100).toFixed(0)}%，要求 ≥68%`)
  assert.ok(covered.size >= 800, `去重汉字偏少：${covered.size}`)
})

test('常用字表：按字频排序，且每个字的编码与编码器一致', () => {  assert.equal(HANZI.length, HANZI_COUNT)
  assert.ok(HANZI_COUNT >= 3000, `常用字表偏少：${HANZI_COUNT}`)
  const head = HANZI.slice(0, 20).map((r) => r.c).join('')
  assert.equal(head, '的一是不了在人有我他这个们中来上大为和国')
  assert.equal(new Set(HANZI.map((r) => r.c)).size, HANZI.length, '常用字表不应有重复字')

  const problems = []
  for (const row of HANZI) {
    const enc = encode(row.s)
    if (!enc) problems.push(`${row.c}/${row.s}: 无法编码`)
    else if (enc.letters.join('') !== row.code) problems.push(`${row.c}/${row.s}: code=${row.code} 实时=${enc.letters.join('')}`)
  }
  assert.deepEqual(problems.slice(0, 20), [], `\n${problems.slice(0, 20).join('\n')}\n（共 ${problems.length} 条）`)
})
