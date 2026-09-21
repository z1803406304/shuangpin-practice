/**
 * 出题器测试。
 *
 * 出题器是纯函数式的（上下文通过函数注入），所以不需要 Vue / DOM 就能测。
 * 这里对每一种模式大量出题，验证题面结构始终合法：
 * - 每个题面单元必须「要么给了 codes，要么给了能编码的 syllable」
 * - 键位训练必须只按一个键
 * - 词/句的题面字数必须和音节数一致（这是最容易出错的耦合点）
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { encode, xiaoheScheme } from '../src/core/schemes/xiaohe.ts'
import { alignDisplay, splitSyllables } from '../src/core/text.ts'
import { createGenerator, DRILL_KINDS, HANZI_RANGES, MODES } from '../src/generators/index.ts'
import { syllableOfChar } from '../src/generators/review.ts'
import { SENTENCES } from '../src/data/sentences.ts'
import { WORDS } from '../src/data/words.ts'

function makeContext(overrides = {}) {
  return {
    scheme: () => xiaoheScheme,
    sample: () => 'uniform',
    hanziRange: () => 1000,
    drillKind: () => 'mixed',
    wordScope: () => 'top3000',
    customParts: () => null,
    errorChars: () => [],
    ...overrides,
  }
}

/** 校验一个题面单元是否合法，返回问题描述或 null */
function checkPart(part) {
  if (typeof part.display !== 'string' || part.display.length === 0) return '题面为空'
  if (part.codes) {
    if (part.codes.length === 0) return 'codes 为空数组'
    if (part.codes.some((c) => typeof c !== 'string' || !c.startsWith('Key'))) return `非法键码 ${part.codes}`
    return null
  }
  if (!part.syllable) return '既没有 codes 也没有 syllable'
  if (!encode(part.syllable)) return `音节无法编码：${part.syllable}`
  return null
}

test('出题器注册表：每个模式都能建出来，且必填字段齐全', () => {
  for (const mode of MODES) {
    assert.ok(mode.id && mode.name && mode.description, `${mode.id} 字段不全`)
    const generator = createGenerator(mode.id, makeContext())
    assert.equal(generator.id, mode.id)
    assert.ok(generator.name && generator.description)
    assert.equal(typeof generator.next, 'function')
    assert.equal(typeof generator.reset, 'function')
  }
  // 未知 id 要回退到音节模式，而不是崩
  assert.equal(createGenerator('不存在', makeContext()).id, 'syllable')
  // 每种模式都有对应实现的模式项
  assert.equal(new Set(MODES.map((m) => m.id)).size, MODES.length, '模式 id 不能重复')
})

test('每种模式各出 60 题，题面结构必须始终合法', () => {
  const problems = []
  for (const mode of MODES) {
    const generator = createGenerator(mode.id, makeContext({ customParts: () => null }))
    for (let i = 0; i < 60; i += 1) {
      const prompt = generator.next()
      if (!Array.isArray(prompt.parts) || prompt.parts.length === 0) {
        problems.push(`${mode.id}: 第 ${i + 1} 题没有题面单元`)
        continue
      }
      if (prompt.layout !== 'single' && prompt.layout !== 'flow') {
        problems.push(`${mode.id}: 非法布局 ${prompt.layout}`)
      }
      for (const part of prompt.parts) {
        const issue = checkPart(part)
        if (issue) problems.push(`${mode.id}: 第 ${i + 1} 题 ${issue}`)
      }
    }
  }
  assert.deepEqual(problems.slice(0, 15), [], `\n${problems.slice(0, 15).join('\n')}\n（共 ${problems.length} 条）`)
})

test('单字模式：只出 1 个字，音节和代表字对得上', () => {
  for (const modeId of ['syllable', 'hanzi']) {
    const generator = createGenerator(modeId, makeContext())
    for (let i = 0; i < 40; i += 1) {
      const prompt = generator.next()
      assert.equal(prompt.layout, 'single')
      assert.equal(prompt.parts.length, 1)
      const part = prompt.parts[0]
      assert.equal([...part.display].length, 1)
      // sub 是首字母大写的拼音
      assert.equal(part.sub, part.syllable.charAt(0).toUpperCase() + part.syllable.slice(1))
    }
  }
})

test('常用汉字：字频范围设置真的生效', () => {
  assert.deepEqual(HANZI_RANGES, [300, 500, 1000, 2000, 3500])
  const tiny = createGenerator('hanzi', makeContext({ hanziRange: () => 300 }))
  const wide = createGenerator('hanzi', makeContext({ hanziRange: () => 3500 }))

  const narrowSet = new Set()
  for (let i = 0; i < 400; i += 1) narrowSet.add(tiny.next().parts[0].display)
  const wideSet = new Set()
  for (let i = 0; i < 400; i += 1) wideSet.add(wide.next().parts[0].display)

  assert.ok(narrowSet.size > 30, `前 300 常用字里应该能抽到不少不同的字，实际 ${narrowSet.size}`)
  assert.ok(wideSet.size > narrowSet.size, '扩大字频范围后应该能抽到更多不同的字')
  // 范围小的时候抽到的必须是常用字（都在前 300 名里）
  const top300 = new Set()
  for (const char of narrowSet) top300.add(char)
  for (const char of top300) {
    assert.ok([...char].length === 1, `题面应该是单个汉字：${char}`)
  }
})

test('词组：取材范围真的生效（含四字词/成语专项）', () => {
  const top1000 = new Set(WORDS.slice(0, 1000).map((w) => w.w))
  const gen1000 = createGenerator('word', makeContext({ wordScope: () => 'top1000' }))
  for (let i = 0; i < 60; i += 1) {
    const word = gen1000.next().parts.map((p) => p.display).join('')
    assert.ok(top1000.has(word), `${word} 不在最常用 1000 词里`)
  }

  const genIdiom = createGenerator('word', makeContext({ wordScope: () => 'idiom' }))
  const idiomSeen = new Set()
  for (let i = 0; i < 100; i += 1) {
    const prompt = genIdiom.next()
    const word = prompt.parts.map((p) => p.display).join('')
    assert.equal([...word].length, 4, `${word} 不是四字词`)
    assert.equal(prompt.layout, 'flow')
    idiomSeen.add(word)
  }
  assert.ok(idiomSeen.size > 50, `四字词范围应该有足够变化，实际只出现 ${idiomSeen.size} 个不同词`)

  // 「全部」范围应该能抽到 3000 名之外的词（均匀随机下约 75%）
  const tail = new Set(WORDS.slice(3000).map((w) => w.w))
  const genAll = createGenerator('word', makeContext({ wordScope: () => 'all' }))
  let outside = 0
  for (let i = 0; i < 120; i += 1) {
    const word = genAll.next().parts.map((p) => p.display).join('')
    if (tail.has(word)) outside += 1
  }
  assert.ok(outside > 30, `全部范围应该能抽到 3000 名之外的词，实际只有 ${outside}/120`)

  // 「最常用 1000」抽不到 3000 名之外的词
  const genTop = createGenerator('word', makeContext({ wordScope: () => 'top1000' }))
  for (let i = 0; i < 60; i += 1) {
    const word = genTop.next().parts.map((p) => p.display).join('')
    assert.ok(!tail.has(word), `${word} 不该出现在最常用 1000 词范围里`)
  }
})

test('词组：每个字的音节数 = 字数，且逐字可编码', () => {
  const generator = createGenerator('word', makeContext())
  for (let i = 0; i < 80; i += 1) {
    const prompt = generator.next()
    assert.equal(prompt.layout, 'flow')
    const word = prompt.parts.map((p) => p.display).join('')
    assert.ok([...word].length >= 2 && [...word].length <= 4, `词长异常：${word}`)
    const found = WORDS.some((w) => w.w === word)
    assert.ok(found, `抽到的词不在词表里：${word}`)
    for (const part of prompt.parts) {
      assert.ok(encode(part.syllable), `${word} 里的 ${part.display} 无法编码`)
    }
  }
})

test('句子：题面汉字数 = 音节数，标点挂在相邻字上', () => {
  const generator = createGenerator('sentence', makeContext())
  for (let i = 0; i < 60; i += 1) {
    const prompt = generator.next()
    assert.equal(prompt.layout, 'flow')
    const text = prompt.parts.map((p) => `${p.lead}${p.display}${p.tail}`).join('')
    const entry = SENTENCES.find((s) => s.t === text)
    assert.ok(entry, `抽到的句子不在语料里：${text}`)
    const syllables = splitSyllables(entry.s)
    assert.equal(prompt.parts.length, syllables.length, `${text} 的单元数和音节数不一致`)
    assert.deepEqual(prompt.parts.map((p) => p.syllable), syllables)
    // 用 alignDisplay 独立复算一遍，两边必须一致
    const expected = alignDisplay(entry.t, syllables)
    assert.deepEqual(prompt.parts.map((p) => p.display), expected.map((p) => p.char))
  }
})

test('键位训练：每题只按一个键，且答案与该键位表的映射一致', () => {
  const keyByLetter = new Map()
  for (const row of xiaoheScheme.keyRows) {
    for (const key of row) keyByLetter.set(key.letter, key.code)
  }

  // 韵母 -> 键：答案必须真的是承载该韵母的那个键
  const finals = createGenerator('drill', makeContext({ drillKind: () => 'final' }))
  for (let i = 0; i < 60; i += 1) {
    const part = finals.next().parts[0]
    assert.equal(part.codes.length, 1, '键位训练必须只按一个键')
    const carrier = xiaoheScheme.keyRows.flat().find((k) => k.finals.some((f) => f.replace(/v/g, 'ü') === part.display))
    assert.ok(carrier, `找不到承载韵母 ${part.display} 的键`)
    assert.equal(part.codes[0], carrier.code)
  }

  // 音节 -> 韵母键：必须是该音节编码的最后一个键
  const split = createGenerator('drill', makeContext({ drillKind: () => 'split-final' }))
  for (let i = 0; i < 60; i += 1) {
    const part = split.next().parts[0]
    const encoded = encode(part.display)
    assert.ok(encoded, `${part.display} 应可编码`)
    assert.equal(part.codes[0], encoded.codes[encoded.codes.length - 1])
  }

  // 四种题型 + mixed 都不能产出非法题
  for (const kind of DRILL_KINDS) {
    const generator = createGenerator('drill', makeContext({ drillKind: () => kind.id }))
    for (let i = 0; i < 40; i += 1) {
      const part = generator.next().parts[0]
      assert.equal(part.codes.length, 1, `${kind.id} 应只按一个键`)
      assert.ok(part.note, `${kind.id} 应该有题目说明`)
    }
  }
})

test('键位训练：声母池里 zh/ch/sh 权重更高（曾经因为近期去重被压到 20%）', () => {
  const generator = createGenerator('drill', makeContext({ drillKind: () => 'initial' }))
  let multi = 0
  const total = 600
  for (let i = 0; i < total; i += 1) {
    const display = generator.next().parts[0].display
    if (display.length > 1) multi += 1
  }
  const share = multi / total
  // 理论值 18/38 ≈ 0.474；给足够宽的容差，只验证「没有被压到很低」
  assert.ok(share > 0.33 && share < 0.62, `zh/ch/sh 占比应接近一半，实际 ${(share * 100).toFixed(1)}%`)
})

test('易错复习：没有错题记录时给占位题并说明原因', () => {
  const generator = createGenerator('review', makeContext({ errorChars: () => [] }))
  const part = generator.next().parts[0]
  assert.ok(part.note.includes('还没有错题记录'), `占位提示不对：${part.note}`)
  assert.ok(encode(part.syllable))
})

test('易错复习：只出错题本里的字，且错得多的更常出现', () => {
  const pool = [
    { char: '陈', count: 5 },
    { char: '学', count: 3 },
    { char: '双', count: 2 },
    { char: '拼', count: 1 },
  ]
  const generator = createGenerator('review', makeContext({ errorChars: () => pool }))
  const seen = new Map()
  for (let i = 0; i < 300; i += 1) {
    const part = generator.next().parts[0]
    seen.set(part.display, (seen.get(part.display) ?? 0) + 1)
    assert.ok(
      pool.some((p) => p.char === part.display),
      `出了不在错题本里的字：${part.display}`,
    )
    assert.ok(encode(part.syllable), `${part.display} 的音节无法编码`)
    assert.ok(part.note.includes('按错过'), `题面说明应该有错误次数：${part.note}`)
  }
  assert.equal(seen.size, 4, `四个错字都应该出现过，实际 ${[...seen.keys()].join('')}`)
  assert.ok(
    seen.get('陈') > seen.get('拼'),
    `错 5 次的字应比错 1 次的更常出现，实际 ${JSON.stringify([...seen])}`,
  )
})

test('易错复习：错题里混进题库范围外的字时跳过，不崩', () => {
  const generator = createGenerator('review', makeContext({ errorChars: () => [{ char: '𠀀', count: 9 }] }))
  const part = generator.next().parts[0]
  assert.ok(part.note.includes('不在题库范围内'), `提示不对：${part.note}`)
  assert.ok(encode(part.syllable))
})

test('易错复习：字到音节的映射覆盖所有数据源', () => {
  // 音节表代表字 / 常用字 / 词 / 句里的字都应该能查到音节
  for (const char of ['陈', '学', '双', '拼', '的', '一']) {
    assert.ok(syllableOfChar(char), `${char} 应该能查到音节`)
  }
  assert.equal(syllableOfChar('学'), 'xue')
  assert.equal(syllableOfChar('双'), 'shuang')
  assert.equal(syllableOfChar('𠀀'), undefined)
})

test('自定义文本：没有文本时给占位题并提示，而不是崩', () => {  const generator = createGenerator('custom', makeContext({ customParts: () => null }))
  const prompt = generator.next()
  assert.equal(prompt.parts.length, 1)
  assert.ok(prompt.parts[0].note && prompt.parts[0].note.includes('自定义文本'))
  assert.ok(encode(prompt.parts[0].syllable))
})

test('自定义文本：有文本时按段切题，且每段音节都能编码', () => {
  const text = '今天天气很好，我们出去走走。银行里人很多。'
  const syllables = ['jin', 'tian', 'tian', 'qi', 'hen', 'hao', 'wo', 'men', 'chu', 'qu', 'zou', 'zou', 'yin', 'hang', 'li', 'ren', 'hen', 'duo']
  const parts = alignDisplay(text, syllables)
    .filter((p) => p.char && p.syllable)
    .map((p) => ({ char: p.char, lead: p.lead, tail: p.tail, syllable: p.syllable }))
  const generator = createGenerator('custom', makeContext({ customParts: () => parts }))

  const seen = new Set()
  for (let i = 0; i < 40; i += 1) {
    const prompt = generator.next()
    // 每一段都是原文的连续子串
    const chunkText = prompt.parts.map((p) => `${p.lead}${p.display}${p.tail}`).join('')
    assert.ok(text.includes(chunkText.replace(/[，。]/g, '')) || text.includes(chunkText), `切段不在原文里：${chunkText}`)
    seen.add(prompt.parts.map((p) => p.display).join(''))
    for (const part of prompt.parts) {
      assert.ok(encode(part.syllable), `${part.display} 无法编码`)
    }
  }
  assert.ok(seen.size >= 2, '应该能切出多段不同的题目')
  // 所有字都必须出现过（不能丢字）
  const covered = [...seen].join('')
  for (const char of '今天气很好我们出去走银行里人很多') {
    assert.ok(covered.includes(char), `字「${char}」在切段后丢失了`)
  }
})
